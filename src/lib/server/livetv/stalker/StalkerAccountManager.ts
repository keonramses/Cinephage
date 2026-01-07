/**
 * Stalker Account Manager
 *
 * Manages Stalker Portal accounts - CRUD operations, testing, and metadata refresh.
 * Follows the singleton manager pattern used by DownloadClientManager.
 */

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { stalkerAccounts, type StalkerAccountRecord } from '$lib/server/db/schema';
import { logger } from '$lib/logging';
import { createStalkerClient } from './StalkerPortalClient';
import type {
	StalkerAccount,
	StalkerAccountInput,
	StalkerAccountUpdate,
	StalkerAccountTestConfig,
	StalkerAccountTestResult
} from '$lib/types/livetv';

/**
 * Convert database record to API response type
 */
function recordToAccount(record: StalkerAccountRecord): StalkerAccount {
	return {
		id: record.id,
		name: record.name,
		portalUrl: record.portalUrl,
		macAddress: record.macAddress,
		enabled: record.enabled ?? true,
		playbackLimit: record.playbackLimit,
		channelCount: record.channelCount,
		categoryCount: record.categoryCount,
		expiresAt: record.expiresAt,
		serverTimezone: record.serverTimezone,
		lastTestedAt: record.lastTestedAt,
		lastTestSuccess: record.lastTestSuccess,
		lastTestError: record.lastTestError,
		lastSyncAt: record.lastSyncAt,
		lastSyncError: record.lastSyncError,
		syncStatus: (record.syncStatus as StalkerAccount['syncStatus']) ?? 'never',
		createdAt: record.createdAt ?? new Date().toISOString(),
		updatedAt: record.updatedAt ?? new Date().toISOString()
	};
}

export class StalkerAccountManager {
	/**
	 * Get all Stalker accounts
	 */
	async getAccounts(): Promise<StalkerAccount[]> {
		const records = db.select().from(stalkerAccounts).all();
		return records.map(recordToAccount);
	}

	/**
	 * Get a Stalker account by ID
	 */
	async getAccount(id: string): Promise<StalkerAccount | null> {
		const record = db.select().from(stalkerAccounts).where(eq(stalkerAccounts.id, id)).get();

		if (!record) {
			return null;
		}

		return recordToAccount(record);
	}

	/**
	 * Create a new Stalker account
	 * Optionally tests the connection before saving
	 */
	async createAccount(
		input: StalkerAccountInput,
		testFirst: boolean = true
	): Promise<StalkerAccount> {
		const now = new Date().toISOString();

		// Test connection if requested
		let testResult: StalkerAccountTestResult | null = null;
		if (testFirst) {
			testResult = await this.testAccount({
				portalUrl: input.portalUrl,
				macAddress: input.macAddress
			});

			if (!testResult.success) {
				throw new Error(`Connection test failed: ${testResult.error}`);
			}
		}

		// Prepare insert data
		const insertData: typeof stalkerAccounts.$inferInsert = {
			name: input.name,
			portalUrl: input.portalUrl,
			macAddress: input.macAddress.toUpperCase(),
			enabled: input.enabled ?? true,
			createdAt: now,
			updatedAt: now
		};

		// Add test result metadata if available
		if (testResult?.success && testResult.profile) {
			insertData.playbackLimit = testResult.profile.playbackLimit;
			insertData.channelCount = testResult.profile.channelCount;
			insertData.categoryCount = testResult.profile.categoryCount;
			insertData.expiresAt = testResult.profile.expiresAt;
			insertData.serverTimezone = testResult.profile.serverTimezone;
			insertData.lastTestedAt = now;
			insertData.lastTestSuccess = true;
			insertData.lastTestError = null;
		}

		const record = db.insert(stalkerAccounts).values(insertData).returning().get();

		logger.info('[StalkerAccountManager] Created account', {
			id: record.id,
			name: record.name,
			portalUrl: record.portalUrl
		});

		return recordToAccount(record);
	}

	/**
	 * Update an existing Stalker account
	 */
	async updateAccount(id: string, updates: StalkerAccountUpdate): Promise<StalkerAccount | null> {
		const existing = await this.getAccount(id);
		if (!existing) {
			return null;
		}

		const now = new Date().toISOString();
		const updateData: Partial<typeof stalkerAccounts.$inferInsert> = {
			updatedAt: now
		};

		if (updates.name !== undefined) {
			updateData.name = updates.name;
		}
		if (updates.portalUrl !== undefined) {
			updateData.portalUrl = updates.portalUrl;
		}
		if (updates.macAddress !== undefined) {
			updateData.macAddress = updates.macAddress.toUpperCase();
		}
		if (updates.enabled !== undefined) {
			updateData.enabled = updates.enabled;
		}

		const record = db
			.update(stalkerAccounts)
			.set(updateData)
			.where(eq(stalkerAccounts.id, id))
			.returning()
			.get();

		if (!record) {
			return null;
		}

		logger.info('[StalkerAccountManager] Updated account', {
			id: record.id,
			name: record.name
		});

		return recordToAccount(record);
	}

	/**
	 * Delete a Stalker account
	 */
	async deleteAccount(id: string): Promise<boolean> {
		const existing = await this.getAccount(id);
		if (!existing) {
			return false;
		}

		db.delete(stalkerAccounts).where(eq(stalkerAccounts.id, id)).run();

		logger.info('[StalkerAccountManager] Deleted account', {
			id,
			name: existing.name
		});

		return true;
	}

	/**
	 * Test a Stalker account configuration (without saving)
	 */
	async testAccount(config: StalkerAccountTestConfig): Promise<StalkerAccountTestResult> {
		const client = createStalkerClient(config.portalUrl, config.macAddress);
		return client.testConnection();
	}

	/**
	 * Test an existing account by ID
	 */
	async testAccountById(id: string): Promise<StalkerAccountTestResult> {
		const account = await this.getAccount(id);
		if (!account) {
			return {
				success: false,
				error: 'Account not found'
			};
		}

		const result = await this.testAccount({
			portalUrl: account.portalUrl,
			macAddress: account.macAddress
		});

		// Update test results in database
		const now = new Date().toISOString();
		const updateData: Partial<typeof stalkerAccounts.$inferInsert> = {
			lastTestedAt: now,
			lastTestSuccess: result.success,
			lastTestError: result.error ?? null,
			updatedAt: now
		};

		// Update metadata if test succeeded
		if (result.success && result.profile) {
			updateData.playbackLimit = result.profile.playbackLimit;
			updateData.channelCount = result.profile.channelCount;
			updateData.categoryCount = result.profile.categoryCount;
			updateData.expiresAt = result.profile.expiresAt;
			updateData.serverTimezone = result.profile.serverTimezone;
		}

		db.update(stalkerAccounts).set(updateData).where(eq(stalkerAccounts.id, id)).run();

		return result;
	}

	/**
	 * Refresh metadata for an account (re-fetch from portal)
	 */
	async refreshAccountMetadata(id: string): Promise<StalkerAccount | null> {
		const result = await this.testAccountById(id);

		if (!result.success) {
			logger.warn('[StalkerAccountManager] Failed to refresh metadata', {
				id,
				error: result.error
			});
		}

		return this.getAccount(id);
	}

	/**
	 * Get accounts that are enabled
	 */
	async getEnabledAccounts(): Promise<StalkerAccount[]> {
		const records = db
			.select()
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.enabled, true))
			.all();

		return records.map(recordToAccount);
	}
}

// Singleton instance
let managerInstance: StalkerAccountManager | null = null;

/**
 * Get the singleton StalkerAccountManager instance
 */
export function getStalkerAccountManager(): StalkerAccountManager {
	if (!managerInstance) {
		managerInstance = new StalkerAccountManager();
	}
	return managerInstance;
}
