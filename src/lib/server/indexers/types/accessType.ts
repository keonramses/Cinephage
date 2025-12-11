/**
 * Indexer Access Types
 *
 * Defines the privacy/access levels for indexers.
 */

// =============================================================================
// ACCESS TYPE ENUM & TYPE
// =============================================================================

/**
 * Indexer access/privacy levels.
 * - public: No registration required, anyone can search
 * - semi-private: Registration required but open, usually API key auth
 * - private: Invite-only or paid, requires account with credentials
 */
export type IndexerAccessType = 'public' | 'semi-private' | 'private';

/**
 * Access type enum for runtime checks
 */
export const IndexerAccessTypes = {
	Public: 'public' as const,
	SemiPrivate: 'semi-private' as const,
	Private: 'private' as const
} as const;

/**
 * All valid access type values
 */
export const ALL_ACCESS_TYPES: IndexerAccessType[] = ['public', 'semi-private', 'private'];

// =============================================================================
// ACCESS TYPE UTILITIES
// =============================================================================

/**
 * Check if an access type requires authentication
 */
export function requiresAuthentication(accessType: IndexerAccessType): boolean {
	return accessType !== 'public';
}

/**
 * Check if an access type is restricted (private or semi-private)
 */
export function isRestricted(accessType: IndexerAccessType): boolean {
	return accessType === 'private' || accessType === 'semi-private';
}

/**
 * Check if an access type value is valid
 */
export function isValidAccessType(value: string): value is IndexerAccessType {
	return ALL_ACCESS_TYPES.includes(value as IndexerAccessType);
}

/**
 * Get display label for access type
 */
export function getAccessTypeLabel(accessType: IndexerAccessType): string {
	switch (accessType) {
		case 'public':
			return 'Public';
		case 'semi-private':
			return 'Semi-Private';
		case 'private':
			return 'Private';
	}
}

/**
 * Get description for access type
 */
export function getAccessTypeDescription(accessType: IndexerAccessType): string {
	switch (accessType) {
		case 'public':
			return 'No registration required';
		case 'semi-private':
			return 'Free registration, API key required';
		case 'private':
			return 'Invite-only or paid membership';
	}
}
