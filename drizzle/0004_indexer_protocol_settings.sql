-- Migration: Add protocol-specific settings columns to indexers table
-- This migration adds JSON columns for torrent, usenet, and streaming settings
-- while preserving backwards compatibility with existing flat fields.

-- Add new JSON columns for protocol-specific settings
ALTER TABLE `indexers` ADD COLUMN `torrent_settings` text;--> statement-breakpoint
ALTER TABLE `indexers` ADD COLUMN `usenet_settings` text;--> statement-breakpoint
ALTER TABLE `indexers` ADD COLUMN `streaming_settings` text;--> statement-breakpoint

-- Migrate existing torrent settings to the new torrent_settings JSON column
-- This preserves the existing data while moving to the new structure
UPDATE `indexers` 
SET `torrent_settings` = json_object(
    'minimumSeeders', COALESCE(`minimum_seeders`, 1),
    'seedRatio', `seed_ratio`,
    'seedTime', `seed_time`,
    'packSeedTime', `pack_seed_time`,
    'preferMagnetUrl', CASE WHEN `prefer_magnet_url` = 1 THEN json('true') ELSE json('false') END
)
WHERE `protocol` = 'torrent';--> statement-breakpoint

-- Initialize empty streaming settings for existing streaming indexers
UPDATE `indexers`
SET `streaming_settings` = json_object(
    'baseUrl', json_extract(`settings`, '$.baseUrl'),
    'preferredQuality', 'auto',
    'includeInAutoSearch', json('true')
)
WHERE `protocol` = 'streaming';--> statement-breakpoint

-- Initialize empty usenet settings for any usenet indexers
UPDATE `indexers`
SET `usenet_settings` = json_object(
    'minimumRetention', json('null'),
    'downloadPriority', 'normal',
    'preferCompleteNzb', json('true')
)
WHERE `protocol` = 'usenet';
