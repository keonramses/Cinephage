-- Migration: Complete Indexer System V2 Overhaul
-- This migration implements a clean YAML-only indexer architecture.
-- WARNING: This is a destructive migration - all existing indexer configurations will be lost.
-- Users will need to reconfigure their indexers after this migration.

-- ============================================================================
-- Step 1: Create indexer_definitions table for caching YAML definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS `indexer_definitions` (
    `id` text PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `description` text,
    `protocol` text NOT NULL CHECK (`protocol` IN ('torrent', 'usenet', 'streaming')),
    `type` text NOT NULL CHECK (`type` IN ('public', 'semi-private', 'private')),
    `language` text DEFAULT 'en-US',
    `urls` text NOT NULL,
    `legacy_urls` text,
    `settings_schema` text,
    `capabilities` text NOT NULL,
    `file_path` text,
    `file_hash` text,
    `loaded_at` text NOT NULL,
    `updated_at` text NOT NULL
);--> statement-breakpoint

-- ============================================================================
-- Step 2: Drop existing indexer tables (clean slate)
-- ============================================================================
DROP TABLE IF EXISTS `indexer_status`;--> statement-breakpoint
DROP TABLE IF EXISTS `indexers`;--> statement-breakpoint

-- ============================================================================
-- Step 3: Create clean indexers table
-- ============================================================================
CREATE TABLE `indexers` (
    `id` text PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `definition_id` text NOT NULL,
    `enabled` integer DEFAULT 1,
    `base_url` text NOT NULL,
    `alternate_urls` text,
    `priority` integer DEFAULT 25,
    `enable_automatic_search` integer DEFAULT 1,
    `enable_interactive_search` integer DEFAULT 1,
    `settings` text,
    `protocol_settings` text,
    `created_at` text DEFAULT (datetime('now')),
    `updated_at` text DEFAULT (datetime('now'))
);--> statement-breakpoint

-- ============================================================================
-- Step 4: Create clean indexer_status table
-- ============================================================================
CREATE TABLE `indexer_status` (
    `indexer_id` text PRIMARY KEY NOT NULL REFERENCES `indexers`(`id`) ON DELETE CASCADE,
    `health` text DEFAULT 'healthy' CHECK (`health` IN ('healthy', 'warning', 'failing', 'disabled')),
    `consecutive_failures` integer DEFAULT 0 NOT NULL,
    `total_requests` integer DEFAULT 0 NOT NULL,
    `total_failures` integer DEFAULT 0 NOT NULL,
    `is_disabled` integer DEFAULT 0 NOT NULL,
    `disabled_at` text,
    `disabled_until` text,
    `last_success` text,
    `last_failure` text,
    `last_error_message` text,
    `avg_response_time` integer,
    `recent_failures` text DEFAULT '[]',
    `created_at` text DEFAULT (datetime('now')),
    `updated_at` text DEFAULT (datetime('now'))
);--> statement-breakpoint

-- ============================================================================
-- Step 5: Create indexes for performance
-- ============================================================================
CREATE INDEX `idx_indexers_definition` ON `indexers`(`definition_id`);--> statement-breakpoint
CREATE INDEX `idx_indexers_enabled` ON `indexers`(`enabled`);--> statement-breakpoint
CREATE INDEX `idx_indexer_status_health` ON `indexer_status`(`health`, `is_disabled`);--> statement-breakpoint
CREATE INDEX `idx_indexer_definitions_protocol` ON `indexer_definitions`(`protocol`);--> statement-breakpoint
CREATE INDEX `idx_indexer_definitions_type` ON `indexer_definitions`(`type`);
