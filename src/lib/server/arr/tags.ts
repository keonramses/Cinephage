/**
 * Radarr/Sonarr-compatible `tag` response.
 *
 * Cinephage's `tags` columns (custom formats, scoring profiles, root
 * folders) are free-text JSON string arrays per-entity, not a normalized
 * registry with stable IDs like Radarr/Sonarr's flat `{id, label}` tag
 * list. There's nothing real to back this with yet, so an empty list is
 * returned - most setup flows tolerate that fine since tags are optional
 * metadata, not something required to add a root folder or quality
 * profile. Revisit if/when Cinephage grows an actual tag registry.
 */

export function buildTags(): Array<{ id: number; label: string }> {
	return [];
}
