CREATE INDEX `idx_blocklist_movie` ON `blocklist` (`movie_id`);--> statement-breakpoint
CREATE INDEX `idx_blocklist_series` ON `blocklist` (`series_id`);--> statement-breakpoint
CREATE INDEX `idx_blocklist_infohash` ON `blocklist` (`info_hash`);--> statement-breakpoint
CREATE INDEX `idx_download_queue_status` ON `download_queue` (`status`);--> statement-breakpoint
CREATE INDEX `idx_download_queue_movie` ON `download_queue` (`movie_id`);--> statement-breakpoint
CREATE INDEX `idx_download_queue_series` ON `download_queue` (`series_id`);--> statement-breakpoint
CREATE INDEX `idx_episodes_series_season` ON `episodes` (`series_id`,`season_number`);--> statement-breakpoint
CREATE INDEX `idx_episodes_monitored_hasfile` ON `episodes` (`monitored`,`has_file`);--> statement-breakpoint
CREATE INDEX `idx_episodes_airdate` ON `episodes` (`air_date`);--> statement-breakpoint
CREATE INDEX `idx_indexer_status_health` ON `indexer_status` (`health`,`is_disabled`);--> statement-breakpoint
CREATE INDEX `idx_monitoring_history_movie` ON `monitoring_history` (`movie_id`);--> statement-breakpoint
CREATE INDEX `idx_monitoring_history_series` ON `monitoring_history` (`series_id`);--> statement-breakpoint
CREATE INDEX `idx_monitoring_history_episode` ON `monitoring_history` (`episode_id`);--> statement-breakpoint
CREATE INDEX `idx_movies_monitored_hasfile` ON `movies` (`monitored`,`has_file`);--> statement-breakpoint
CREATE INDEX `idx_series_monitored` ON `series` (`monitored`);--> statement-breakpoint
CREATE INDEX `idx_subtitles_movie` ON `subtitles` (`movie_id`);--> statement-breakpoint
CREATE INDEX `idx_subtitles_episode` ON `subtitles` (`episode_id`);