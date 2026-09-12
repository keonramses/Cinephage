/**
 * Radarr/Sonarr-compatible `language` response.
 */

export function buildLanguages(): Array<{ id: number; name: string; nameLower: string }> {
	return [{ id: 1, name: 'English', nameLower: 'english' }];
}
