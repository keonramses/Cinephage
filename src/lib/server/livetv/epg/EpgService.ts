/**
 * EPG Service
 *
 * Manages Electronic Program Guide (EPG) data for Live TV.
 * Fetches EPG from Stalker portal accounts and provides query methods.
 */

import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '$lib/server/db';
import {
	stalkerAccounts,
	stalkerChannels,
	epgPrograms,
	type EpgProgramRecord
} from '$lib/server/db/schema';
import { logger } from '$lib/logging';
import { StalkerPortalClient, type StalkerPortalConfig } from '../stalker/StalkerPortalClient';
import type {
	EpgProgram,
	EpgProgramWithProgress,
	EpgSyncResult,
	ChannelNowNext,
	EpgProgramRaw
} from '$lib/types/livetv';

const BATCH_SIZE = 1000;
const DEFAULT_RETENTION_HOURS = 48;
const DEFAULT_LOOKAHEAD_HOURS = 24;

export class EpgService {
	/**
	 * Update account EPG tracking columns after sync
	 */
	private updateAccountEpgStatus(
		accountId: string,
		status: {
			success: boolean;
			programCount?: number;
			hasEpg?: boolean;
			error?: string;
		}
	): void {
		const now = new Date().toISOString();

		db.update(stalkerAccounts)
			.set({
				lastEpgSyncAt: now,
				lastEpgSyncError: status.success ? null : (status.error ?? null),
				...(status.programCount !== undefined && { epgProgramCount: status.programCount }),
				...(status.hasEpg !== undefined && { hasEpg: status.hasEpg }),
				updatedAt: now
			})
			.where(eq(stalkerAccounts.id, accountId))
			.run();
	}

	/**
	 * Sync EPG data for a single account
	 */
	async syncAccount(accountId: string): Promise<EpgSyncResult> {
		const startTime = Date.now();

		// Get account
		const account = db
			.select()
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.id, accountId))
			.get();

		if (!account) {
			return {
				success: false,
				accountId,
				accountName: 'Unknown',
				programsAdded: 0,
				programsUpdated: 0,
				programsRemoved: 0,
				duration: Date.now() - startTime,
				error: 'Account not found'
			};
		}

		if (!account.enabled) {
			return {
				success: false,
				accountId,
				accountName: account.name,
				programsAdded: 0,
				programsUpdated: 0,
				programsRemoved: 0,
				duration: Date.now() - startTime,
				error: 'Account is disabled'
			};
		}

		try {
			logger.info('[EpgService] Starting EPG sync', { accountId, name: account.name });

			// Build client config from account record
			const config: StalkerPortalConfig = {
				portalUrl: account.portalUrl,
				macAddress: account.macAddress,
				serialNumber: account.serialNumber || this.generateSerialNumber(),
				deviceId: account.deviceId || this.generateDeviceId(),
				deviceId2: account.deviceId2 || this.generateDeviceId(),
				model: account.model || 'MAG254',
				timezone: account.timezone || 'Europe/London',
				token: account.token || undefined,
				username: account.username || undefined,
				password: account.password || undefined
			};

			const client = new StalkerPortalClient(config);
			await client.start();

			// Fetch EPG data from portal
			const epgData = await client.getEpgInfo(DEFAULT_LOOKAHEAD_HOURS);

			if (epgData.size === 0) {
				logger.info('[EpgService] No EPG data returned from portal', {
					accountId,
					name: account.name
				});

				// Update account status - portal has no EPG data
				this.updateAccountEpgStatus(accountId, {
					success: true,
					programCount: 0,
					hasEpg: false
				});

				return {
					success: true,
					accountId,
					accountName: account.name,
					programsAdded: 0,
					programsUpdated: 0,
					programsRemoved: 0,
					duration: Date.now() - startTime
				};
			}

			// Build a map of stalker channel IDs to our local channel IDs
			const channels = db
				.select({ id: stalkerChannels.id, stalkerId: stalkerChannels.stalkerId })
				.from(stalkerChannels)
				.where(eq(stalkerChannels.accountId, accountId))
				.all();

			const channelMap = new Map<string, string>();
			for (const ch of channels) {
				channelMap.set(ch.stalkerId, ch.id);
			}

			// Process and store EPG data
			const result = await this.storeEpgData(accountId, epgData, channelMap);

			logger.info('[EpgService] EPG sync complete', {
				accountId,
				name: account.name,
				...result,
				duration: Date.now() - startTime
			});

			// Update account status - successful sync with EPG data
			const totalPrograms = result.programsAdded + result.programsUpdated;
			this.updateAccountEpgStatus(accountId, {
				success: true,
				programCount: totalPrograms > 0 ? this.getAccountProgramCount(accountId) : 0,
				hasEpg: true
			});

			return {
				success: true,
				accountId,
				accountName: account.name,
				...result,
				duration: Date.now() - startTime
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[EpgService] EPG sync failed', {
				accountId,
				name: account.name,
				error: message
			});

			// Update account status - sync failed
			this.updateAccountEpgStatus(accountId, {
				success: false,
				error: message
			});

			return {
				success: false,
				accountId,
				accountName: account.name,
				programsAdded: 0,
				programsUpdated: 0,
				programsRemoved: 0,
				duration: Date.now() - startTime,
				error: message
			};
		}
	}

	/**
	 * Sync EPG data for all enabled accounts
	 */
	async syncAll(): Promise<EpgSyncResult[]> {
		const accounts = db
			.select()
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.enabled, true))
			.all();

		logger.info('[EpgService] Starting EPG sync for all accounts', {
			accountCount: accounts.length
		});

		const results: EpgSyncResult[] = [];

		for (const account of accounts) {
			const result = await this.syncAccount(account.id);
			results.push(result);
		}

		const totalAdded = results.reduce((sum, r) => sum + r.programsAdded, 0);
		const totalUpdated = results.reduce((sum, r) => sum + r.programsUpdated, 0);
		const successful = results.filter((r) => r.success).length;

		logger.info('[EpgService] EPG sync complete for all accounts', {
			accounts: accounts.length,
			successful,
			totalAdded,
			totalUpdated
		});

		return results;
	}

	/**
	 * Store EPG data in the database
	 */
	private async storeEpgData(
		accountId: string,
		epgData: Map<string, EpgProgramRaw[]>,
		channelMap: Map<string, string>
	): Promise<{ programsAdded: number; programsUpdated: number; programsRemoved: number }> {
		let programsAdded = 0;
		let programsUpdated = 0;
		const now = new Date().toISOString();

		// Collect all programs to upsert
		const allPrograms: {
			id: string;
			channelId: string;
			stalkerChannelId: string;
			accountId: string;
			title: string;
			description: string | null;
			category: string | null;
			director: string | null;
			actor: string | null;
			startTime: string;
			endTime: string;
			duration: number;
			hasArchive: boolean;
			cachedAt: string;
			updatedAt: string;
		}[] = [];

		for (const [stalkerChannelId, programs] of epgData) {
			const localChannelId = channelMap.get(stalkerChannelId);
			if (!localChannelId) {
				// Channel not in our database, skip
				continue;
			}

			for (const program of programs) {
				// Convert portal timestamps to ISO strings
				const startTime = new Date(program.start_timestamp * 1000).toISOString();
				const endTime = new Date(program.stop_timestamp * 1000).toISOString();

				allPrograms.push({
					id: randomUUID(),
					channelId: localChannelId,
					stalkerChannelId,
					accountId,
					title: program.name,
					description: program.descr || null,
					category: program.category || null,
					director: program.director || null,
					actor: program.actor || null,
					startTime,
					endTime,
					duration: program.duration,
					hasArchive: program.mark_archive === 1,
					cachedAt: now,
					updatedAt: now
				});
			}
		}

		// Upsert programs in batches
		for (let i = 0; i < allPrograms.length; i += BATCH_SIZE) {
			const batch = allPrograms.slice(i, i + BATCH_SIZE);

			// Use INSERT OR REPLACE for upsert behavior
			for (const program of batch) {
				// Check if program exists (by unique constraint: account_id, stalker_channel_id, start_time)
				const existing = db
					.select({ id: epgPrograms.id })
					.from(epgPrograms)
					.where(
						and(
							eq(epgPrograms.accountId, program.accountId),
							eq(epgPrograms.stalkerChannelId, program.stalkerChannelId),
							eq(epgPrograms.startTime, program.startTime)
						)
					)
					.get();

				if (existing) {
					// Update existing
					db.update(epgPrograms)
						.set({
							title: program.title,
							description: program.description,
							category: program.category,
							director: program.director,
							actor: program.actor,
							endTime: program.endTime,
							duration: program.duration,
							hasArchive: program.hasArchive,
							updatedAt: now
						})
						.where(eq(epgPrograms.id, existing.id))
						.run();
					programsUpdated++;
				} else {
					// Insert new
					db.insert(epgPrograms).values(program).run();
					programsAdded++;
				}
			}
		}

		// Remove old programs (past retention period)
		const cutoffTime = new Date(
			Date.now() - DEFAULT_RETENTION_HOURS * 60 * 60 * 1000
		).toISOString();
		const deleted = db
			.delete(epgPrograms)
			.where(and(eq(epgPrograms.accountId, accountId), lte(epgPrograms.endTime, cutoffTime)))
			.run();

		return {
			programsAdded,
			programsUpdated,
			programsRemoved: deleted.changes
		};
	}

	/**
	 * Get current and next program for multiple channels
	 * @param channelIds - Array of local channel IDs (from channel_lineup_items.channel_id)
	 */
	getNowAndNext(channelIds: string[]): Map<string, ChannelNowNext> {
		if (channelIds.length === 0) {
			return new Map();
		}

		const now = new Date();
		const nowIso = now.toISOString();

		const result = new Map<string, ChannelNowNext>();

		// Initialize results
		for (const channelId of channelIds) {
			result.set(channelId, {
				channelId,
				now: null,
				next: null
			});
		}

		// Get all programs that could be current or next
		// (starts before now+2h and ends after now)
		const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

		const programs = db
			.select()
			.from(epgPrograms)
			.where(
				and(
					inArray(epgPrograms.channelId, channelIds),
					lte(epgPrograms.startTime, twoHoursLater),
					gte(epgPrograms.endTime, nowIso)
				)
			)
			.orderBy(epgPrograms.startTime)
			.all();

		// Group by channel
		const byChannel = new Map<string, EpgProgramRecord[]>();
		for (const program of programs) {
			const existing = byChannel.get(program.channelId) || [];
			existing.push(program);
			byChannel.set(program.channelId, existing);
		}

		// Find current and next for each channel
		for (const [channelId, channelPrograms] of byChannel) {
			const entry = result.get(channelId);
			if (!entry) continue;

			for (const program of channelPrograms) {
				const startTime = new Date(program.startTime);
				const endTime = new Date(program.endTime);

				// Check if current (now is between start and end)
				if (startTime <= now && endTime > now) {
					entry.now = this.programToWithProgress(program, now);
				}
				// Check if next (starts after now and we don't have a next yet)
				else if (startTime > now && !entry.next) {
					entry.next = this.programRecordToEpgProgram(program);
				}

				// If we have both, stop
				if (entry.now && entry.next) break;
			}
		}

		return result;
	}

	/**
	 * Get programs for a time range (for guide view)
	 * @param channelIds - Array of local channel IDs
	 * @param start - Start time
	 * @param end - End time
	 */
	getGuideData(channelIds: string[], start: Date, end: Date): Map<string, EpgProgram[]> {
		if (channelIds.length === 0) {
			return new Map();
		}

		const startIso = start.toISOString();
		const endIso = end.toISOString();

		const programs = db
			.select()
			.from(epgPrograms)
			.where(
				and(
					inArray(epgPrograms.channelId, channelIds),
					// Program overlaps with time range if:
					// - starts before end AND ends after start
					lte(epgPrograms.startTime, endIso),
					gte(epgPrograms.endTime, startIso)
				)
			)
			.orderBy(epgPrograms.startTime)
			.all();

		// Group by channel
		const result = new Map<string, EpgProgram[]>();

		for (const program of programs) {
			const existing = result.get(program.channelId) || [];
			existing.push(this.programRecordToEpgProgram(program));
			result.set(program.channelId, existing);
		}

		return result;
	}

	/**
	 * Get programs for a single channel
	 */
	getChannelPrograms(channelId: string, start: Date, end: Date): EpgProgram[] {
		const startIso = start.toISOString();
		const endIso = end.toISOString();

		const programs = db
			.select()
			.from(epgPrograms)
			.where(
				and(
					eq(epgPrograms.channelId, channelId),
					lte(epgPrograms.startTime, endIso),
					gte(epgPrograms.endTime, startIso)
				)
			)
			.orderBy(epgPrograms.startTime)
			.all();

		return programs.map((p) => this.programRecordToEpgProgram(p));
	}

	/**
	 * Cleanup old EPG programs
	 * @param retentionHours - Number of hours to keep past programs
	 * @returns Number of deleted programs
	 */
	cleanup(retentionHours: number = DEFAULT_RETENTION_HOURS): number {
		const cutoffTime = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();

		const deleted = db.delete(epgPrograms).where(lte(epgPrograms.endTime, cutoffTime)).run();

		if (deleted.changes > 0) {
			logger.info('[EpgService] Cleaned up old EPG programs', {
				deleted: deleted.changes,
				cutoffTime
			});
		}

		return deleted.changes;
	}

	/**
	 * Get total program count
	 */
	getProgramCount(): number {
		const result = db
			.select({ count: sql<number>`count(*)` })
			.from(epgPrograms)
			.get();
		return result?.count ?? 0;
	}

	/**
	 * Get program count by account
	 */
	getProgramCountByAccount(): Map<string, number> {
		const results = db
			.select({
				accountId: epgPrograms.accountId,
				count: sql<number>`count(*)`
			})
			.from(epgPrograms)
			.groupBy(epgPrograms.accountId)
			.all();

		const map = new Map<string, number>();
		for (const row of results) {
			map.set(row.accountId, row.count);
		}
		return map;
	}

	/**
	 * Get program count for a specific account
	 */
	private getAccountProgramCount(accountId: string): number {
		const result = db
			.select({ count: sql<number>`count(*)` })
			.from(epgPrograms)
			.where(eq(epgPrograms.accountId, accountId))
			.get();
		return result?.count ?? 0;
	}

	/**
	 * Convert database record to EpgProgram type
	 */
	private programRecordToEpgProgram(record: EpgProgramRecord): EpgProgram {
		return {
			id: record.id,
			channelId: record.channelId,
			stalkerChannelId: record.stalkerChannelId,
			accountId: record.accountId,
			title: record.title,
			description: record.description,
			category: record.category,
			director: record.director,
			actor: record.actor,
			startTime: record.startTime,
			endTime: record.endTime,
			duration: record.duration,
			hasArchive: record.hasArchive ?? false,
			cachedAt: record.cachedAt ?? '',
			updatedAt: record.updatedAt ?? ''
		};
	}

	/**
	 * Convert database record to EpgProgramWithProgress
	 */
	private programToWithProgress(record: EpgProgramRecord, now: Date): EpgProgramWithProgress {
		const startTime = new Date(record.startTime);
		const endTime = new Date(record.endTime);

		const elapsed = now.getTime() - startTime.getTime();
		const total = endTime.getTime() - startTime.getTime();
		const progress = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
		const remainingMs = endTime.getTime() - now.getTime();
		const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));

		return {
			...this.programRecordToEpgProgram(record),
			progress,
			isLive: true,
			remainingMinutes
		};
	}

	/**
	 * Generate a random serial number
	 */
	private generateSerialNumber(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		let sn = '';
		for (let i = 0; i < 12; i++) {
			sn += chars[Math.floor(Math.random() * chars.length)];
		}
		return sn;
	}

	/**
	 * Generate a random device ID
	 */
	private generateDeviceId(): string {
		const chars = 'ABCDEF0123456789';
		let id = '';
		for (let i = 0; i < 32; i++) {
			id += chars[Math.floor(Math.random() * chars.length)];
		}
		return id;
	}
}

// Singleton instance
let epgServiceInstance: EpgService | null = null;

export function getEpgService(): EpgService {
	if (!epgServiceInstance) {
		epgServiceInstance = new EpgService();
	}
	return epgServiceInstance;
}
