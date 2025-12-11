/**
 * Protocol Handler Interface
 *
 * Defines the contract for protocol-specific handlers.
 * Each protocol (torrent, usenet, streaming) implements this interface
 * to handle protocol-specific operations like URL generation, validation,
 * and result processing.
 */

import type { ReleaseResult, EnhancedReleaseResult } from '../types/release';
import type {
	IndexerProtocol,
	TorrentProtocolSettings,
	UsenetProtocolSettings,
	StreamingProtocolSettings
} from '../types/protocol';

// =============================================================================
// PROTOCOL CONTEXT
// =============================================================================

/**
 * Context passed to protocol handlers during operations
 */
export interface ProtocolContext {
	/** Indexer ID */
	indexerId: string;
	/** Indexer name for display */
	indexerName: string;
	/** Base URL of the indexer */
	baseUrl: string;
	/** Protocol settings */
	settings: TorrentProtocolSettings | UsenetProtocolSettings | StreamingProtocolSettings;
	/** Logger function */
	log?: (level: string, message: string, meta?: Record<string, unknown>) => void;
}

// =============================================================================
// PROTOCOL HANDLER INTERFACE
// =============================================================================

/**
 * Base interface for all protocol handlers
 */
export interface IProtocolHandler {
	/** Protocol type this handler manages */
	readonly protocol: IndexerProtocol;

	/**
	 * Validate a raw release result from an indexer
	 */
	validateResult(result: ReleaseResult): boolean;

	/**
	 * Extract protocol-specific metadata from a result
	 */
	extractMetadata(result: ReleaseResult): Record<string, unknown>;

	/**
	 * Calculate protocol-specific score adjustments
	 * Returns a score adjustment (positive or negative)
	 */
	calculateScoreAdjustment(result: EnhancedReleaseResult, context: ProtocolContext): number;

	/**
	 * Generate the final download URL
	 * May transform URLs, add authentication, etc.
	 */
	generateDownloadUrl(result: ReleaseResult, context: ProtocolContext): Promise<string>;

	/**
	 * Determine if a result should be rejected based on protocol-specific criteria
	 * Returns rejection reason or undefined if acceptable
	 */
	shouldReject(result: EnhancedReleaseResult, context: ProtocolContext): string | undefined;

	/**
	 * Get protocol-specific display information
	 */
	getDisplayInfo(result: ReleaseResult): ProtocolDisplayInfo;
}

/**
 * Display information for UI
 */
export interface ProtocolDisplayInfo {
	/** Badge text (e.g., "TORRENT", "USENET", "STREAM") */
	badge: string;
	/** Badge color class */
	badgeClass: string;
	/** Icon name */
	icon: string;
	/** Availability indicator (e.g., seeders, retention, streams) */
	availability?: string;
	/** Additional info items */
	details: Array<{
		label: string;
		value: string;
		tooltip?: string;
	}>;
}

// =============================================================================
// TORRENT HANDLER INTERFACE
// =============================================================================

/**
 * Torrent-specific handler interface
 */
export interface ITorrentHandler extends IProtocolHandler {
	readonly protocol: 'torrent';

	/**
	 * Extract or generate magnet URL
	 */
	getMagnetUrl(result: ReleaseResult): string | undefined;

	/**
	 * Calculate health based on seeders/leechers
	 */
	calculateHealth(seeders: number, leechers: number): TorrentHealth;

	/**
	 * Check if torrent is freeleech
	 */
	isFreeleech(result: ReleaseResult): boolean;
}

/**
 * Torrent health assessment
 */
export interface TorrentHealth {
	/** Health score 0-100 */
	score: number;
	/** Health level */
	level: 'dead' | 'poor' | 'fair' | 'good' | 'excellent';
	/** Human-readable description */
	description: string;
}

// =============================================================================
// USENET HANDLER INTERFACE
// =============================================================================

/**
 * Usenet-specific handler interface
 */
export interface IUsenetHandler extends IProtocolHandler {
	readonly protocol: 'usenet';

	/**
	 * Calculate retention score
	 */
	calculateRetentionScore(ageDays: number, maxRetentionDays: number): number;

	/**
	 * Check if NZB is complete (no missing parts)
	 */
	isComplete(result: ReleaseResult): boolean;

	/**
	 * Get NZB direct download URL
	 */
	getNzbUrl(result: ReleaseResult, apiKey?: string): string;
}

// =============================================================================
// STREAMING HANDLER INTERFACE
// =============================================================================

/**
 * Streaming-specific handler interface
 */
export interface IStreamingHandler extends IProtocolHandler {
	readonly protocol: 'streaming';

	/**
	 * Generate .strm file content
	 */
	generateStrmContent(result: ReleaseResult): string;

	/**
	 * Get available stream qualities/variants
	 */
	getStreamVariants(result: ReleaseResult): StreamVariant[];

	/**
	 * Verify stream is still available
	 */
	verifyStream(url: string): Promise<StreamVerification>;

	/**
	 * Get stream source quality score
	 */
	getSourceQualityScore(result: ReleaseResult): number;
}

/**
 * A stream variant (e.g., different quality options)
 */
export interface StreamVariant {
	/** Quality label (e.g., "1080p", "4K") */
	quality: string;
	/** Stream URL for this variant */
	url: string;
	/** Bitrate in kbps */
	bitrate?: number;
	/** Video codec */
	codec?: string;
	/** Whether this is the default/recommended variant */
	isDefault: boolean;
}

/**
 * Stream verification result
 */
export interface StreamVerification {
	/** Whether stream is available */
	available: boolean;
	/** HTTP status code */
	statusCode?: number;
	/** Content type */
	contentType?: string;
	/** Error message if unavailable */
	error?: string;
	/** Response time in ms */
	responseTime?: number;
}

// =============================================================================
// BASE PROTOCOL HANDLER
// =============================================================================

/**
 * Base class with common functionality for protocol handlers
 */
export abstract class BaseProtocolHandler implements IProtocolHandler {
	abstract readonly protocol: IndexerProtocol;

	validateResult(result: ReleaseResult): boolean {
		// Basic validation - all protocols need these
		if (!result.guid || !result.title || !result.downloadUrl) {
			return false;
		}
		if (result.size <= 0) {
			return false;
		}
		return true;
	}

	abstract extractMetadata(result: ReleaseResult): Record<string, unknown>;

	abstract calculateScoreAdjustment(
		result: EnhancedReleaseResult,
		context: ProtocolContext
	): number;

	async generateDownloadUrl(result: ReleaseResult, _context: ProtocolContext): Promise<string> {
		// Default: return the URL as-is
		return result.downloadUrl;
	}

	abstract shouldReject(
		result: EnhancedReleaseResult,
		context: ProtocolContext
	): string | undefined;

	abstract getDisplayInfo(result: ReleaseResult): ProtocolDisplayInfo;

	/**
	 * Format file size for display
	 */
	protected formatSize(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(2)} ${units[unitIndex]}`;
	}

	/**
	 * Format age for display
	 */
	protected formatAge(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
		if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
		return `${Math.floor(diffDays / 365)} years ago`;
	}
}
