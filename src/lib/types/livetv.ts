/**
 * Live TV Types
 *
 * Type definitions for Live TV functionality, starting with Stalker Portal accounts.
 */

/**
 * Stalker Portal Account - stored in database
 */
export interface StalkerAccount {
	id: string;
	name: string;
	portalUrl: string;
	macAddress: string;
	enabled: boolean;
	// Device parameters for STB emulation
	serialNumber?: string;
	deviceId?: string;
	deviceId2?: string;
	model: string;
	timezone: string;
	// Credentials (password not exposed)
	username?: string;
	hasPassword: boolean;
	// Metadata from portal
	playbackLimit: number | null;
	channelCount: number | null;
	categoryCount: number | null;
	expiresAt: string | null;
	serverTimezone: string | null;
	lastTestedAt: string | null;
	lastTestSuccess: boolean | null;
	lastTestError: string | null;
	// Sync tracking
	lastSyncAt: string | null;
	lastSyncError: string | null;
	syncStatus: 'never' | 'syncing' | 'success' | 'failed';
	createdAt: string;
	updatedAt: string;
}

/**
 * Input for creating a new Stalker account
 */
export interface StalkerAccountInput {
	name: string;
	portalUrl: string;
	macAddress: string;
	enabled?: boolean;
	// Device parameters (optional - will be auto-generated if not provided)
	serialNumber?: string;
	deviceId?: string;
	deviceId2?: string;
	model?: string;
	timezone?: string;
	// Optional credentials
	username?: string;
	password?: string;
}

/**
 * Input for updating an existing Stalker account
 */
export interface StalkerAccountUpdate {
	name?: string;
	portalUrl?: string;
	macAddress?: string;
	enabled?: boolean;
	// Device parameters
	serialNumber?: string;
	deviceId?: string;
	deviceId2?: string;
	model?: string;
	timezone?: string;
	// Credentials
	username?: string;
	password?: string;
}

/**
 * Configuration for testing a Stalker account (before saving)
 */
export interface StalkerAccountTestConfig {
	portalUrl: string;
	macAddress: string;
	// Device parameters (optional - will be auto-generated if not provided)
	serialNumber?: string;
	deviceId?: string;
	deviceId2?: string;
	model?: string;
	timezone?: string;
	// Optional credentials
	username?: string;
	password?: string;
}

/**
 * Profile data returned from Stalker Portal API
 */
export interface StalkerPortalProfile {
	playbackLimit: number;
	status: 'active' | 'blocked' | 'expired';
	serverTimezone: string;
	expiresAt: string | null;
}

/**
 * Result of testing a Stalker account connection
 */
export interface StalkerAccountTestResult {
	success: boolean;
	error?: string;
	profile?: {
		playbackLimit: number;
		channelCount: number;
		categoryCount: number;
		expiresAt: string | null;
		serverTimezone: string;
		status: 'active' | 'blocked' | 'expired';
	};
}

/**
 * Raw profile response from Stalker Portal API
 * Contains many fields, we only use a subset
 */
export interface StalkerRawProfile {
	id: number;
	mac: string;
	status: number;
	blocked: string;
	phone: string;
	fname: string;
	expire_billing_date: string;
	tariff_expired_date: string | null;
	playback_limit: number;
	default_timezone: string;
	[key: string]: unknown;
}

/**
 * Category from Stalker Portal (genre)
 */
export interface StalkerCategory {
	id: string;
	title: string;
	alias: string;
	censored: boolean;
}

/**
 * Channel from Stalker Portal
 */
export interface StalkerChannel {
	id: string;
	name: string;
	number: string;
	logo: string;
	genreId: string;
	cmd: string;
	tvArchive: boolean;
	archiveDuration: number;
}

// ============================================================================
// CACHED DATA TYPES (stored in local database)
// ============================================================================

/**
 * Cached category from database
 */
export interface CachedCategory {
	id: string;
	accountId: string;
	stalkerId: string;
	title: string;
	alias: string | null;
	censored: boolean;
	channelCount: number;
	createdAt: string;
	updatedAt: string;
	// Joined fields
	accountName?: string;
}

/**
 * Cached channel from database
 */
export interface CachedChannel {
	id: string;
	accountId: string;
	stalkerId: string;
	name: string;
	number: string | null;
	logo: string | null;
	categoryId: string | null;
	categoryTitle: string | null;
	stalkerGenreId: string | null;
	cmd: string;
	tvArchive: boolean;
	archiveDuration: number;
	createdAt: string;
	updatedAt: string;
	// Joined fields
	accountName?: string;
}

// ============================================================================
// QUERY AND RESPONSE TYPES
// ============================================================================

/**
 * Query options for channel listing
 */
export interface ChannelQueryOptions {
	accountIds?: string[];
	categoryIds?: string[];
	search?: string;
	hasArchive?: boolean;
	page?: number;
	pageSize?: number;
	sortBy?: 'name' | 'number' | 'category';
	sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response for channel listing
 */
export interface PaginatedChannelResponse {
	items: CachedChannel[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

/**
 * Result of syncing channels from portal
 */
export interface ChannelSyncResult {
	success: boolean;
	categoriesAdded: number;
	categoriesUpdated: number;
	channelsAdded: number;
	channelsUpdated: number;
	channelsRemoved: number;
	duration: number;
	error?: string;
}

/**
 * Sync status for account display
 */
export interface AccountSyncStatus {
	id: string;
	name: string;
	syncStatus: 'never' | 'syncing' | 'success' | 'failed';
	lastSyncAt: string | null;
	lastSyncError: string | null;
	channelCount: number | null;
	categoryCount: number | null;
}

// ============================================================================
// USER CHANNEL CATEGORIES
// ============================================================================

/**
 * User-defined category for organizing their channel lineup
 */
export interface ChannelCategory {
	id: string;
	name: string;
	position: number;
	color: string | null;
	icon: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Form data for creating/editing a category
 */
export interface ChannelCategoryFormData {
	name: string;
	color?: string;
	icon?: string;
}

// ============================================================================
// CHANNEL LINEUP TYPES
// ============================================================================

/**
 * Channel lineup item as stored in the database
 */
export interface ChannelLineupItem {
	id: string;
	accountId: string;
	channelId: string;
	position: number;
	channelNumber: number | null;
	customName: string | null;
	customLogo: string | null;
	epgId: string | null;
	epgSourceChannelId: string | null;
	categoryId: string | null;
	addedAt: string;
	updatedAt: string;
}

/**
 * Enriched lineup item with channel data, account name, and computed display values
 */
export interface ChannelLineupItemWithDetails extends ChannelLineupItem {
	// From stalkerChannels join
	channel: CachedChannel;
	// From stalkerAccounts join
	accountName: string;
	// From channelCategories join
	category: ChannelCategory | null;
	// Computed display values
	displayName: string;
	displayLogo: string | null;
	// EPG source override (when using another channel's EPG)
	epgSourceChannel: CachedChannel | null;
	epgSourceAccountName: string | null;
}

// ============================================================================
// CHANNEL LINEUP BACKUPS
// ============================================================================

/**
 * Backup link for a lineup item - alternative channel source for failover
 */
export interface ChannelBackupLink {
	id: string;
	lineupItemId: string;
	accountId: string;
	channelId: string;
	priority: number;
	createdAt: string;
	updatedAt: string;
	// Joined data
	channel: CachedChannel;
	accountName: string;
}

/**
 * Lineup item extended with backup links
 */
export interface ChannelLineupItemWithBackups extends ChannelLineupItemWithDetails {
	backups: ChannelBackupLink[];
}

/**
 * Request to add a backup link to a lineup item
 */
export interface AddBackupLinkRequest {
	accountId: string;
	channelId: string;
}

/**
 * Request to reorder backup links for a lineup item
 */
export interface ReorderBackupsRequest {
	backupIds: string[];
}

// ============================================================================
// CHANNEL LINEUP REQUESTS
// ============================================================================

/**
 * Request to update a channel's customization
 */
export interface UpdateChannelRequest {
	channelNumber?: number | null;
	customName?: string | null;
	customLogo?: string | null;
	epgId?: string | null;
	epgSourceChannelId?: string | null;
	categoryId?: string | null;
}

/**
 * Request to add channels to the lineup
 */
export interface AddToLineupRequest {
	channels: Array<{
		accountId: string;
		channelId: string;
		categoryId?: string | null;
	}>;
}

/**
 * Request to reorder lineup items
 */
export interface ReorderLineupRequest {
	itemIds: string[];
}

/**
 * Request to remove items from lineup
 */
export interface RemoveFromLineupRequest {
	itemIds: string[];
}

// ============================================================================
// EPG (Electronic Program Guide) TYPES
// ============================================================================

/**
 * Raw EPG program data from Stalker Portal API
 */
export interface EpgProgramRaw {
	id: string;
	ch_id: string;
	time: string;
	time_to: string;
	duration: number;
	name: string;
	descr: string;
	category: string;
	director: string;
	actor: string;
	start_timestamp: number;
	stop_timestamp: number;
	mark_archive: number;
}

/**
 * EPG program stored in database
 */
export interface EpgProgram {
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
}

/**
 * EPG program with computed progress for display
 */
export interface EpgProgramWithProgress extends EpgProgram {
	progress: number; // 0-1 representing how far through the program
	isLive: boolean; // true if currently airing
	remainingMinutes: number;
}

/**
 * Current and next program for a channel
 */
export interface ChannelNowNext {
	channelId: string;
	now: EpgProgramWithProgress | null;
	next: EpgProgram | null;
}

/**
 * Result of syncing EPG from a Stalker account
 */
export interface EpgSyncResult {
	success: boolean;
	accountId: string;
	accountName: string;
	programsAdded: number;
	programsUpdated: number;
	programsRemoved: number;
	duration: number;
	error?: string;
}

/**
 * EPG sync status for display
 */
export interface EpgStatus {
	isEnabled: boolean;
	isSyncing: boolean;
	syncIntervalHours: number;
	retentionHours: number;
	lastSyncAt: string | null;
	nextSyncAt: string | null;
	totalPrograms: number;
	accounts: Array<{
		id: string;
		name: string;
		lastEpgSyncAt: string | null;
		programCount: number;
		hasEpg: boolean | null; // null = unknown, true = has EPG, false = portal has no EPG
		error?: string;
	}>;
}
