import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v137: MigrationDefinition = {
	version: 137,
	name: 'add_debrid_content_type_columns',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'download_clients', 'allow_movies')) {
			sqlite
				.prepare(`ALTER TABLE "download_clients" ADD COLUMN "allow_movies" integer DEFAULT 1`)
				.run();
		}
		if (!columnExists(sqlite, 'download_clients', 'allow_tv')) {
			sqlite
				.prepare(`ALTER TABLE "download_clients" ADD COLUMN "allow_tv" integer DEFAULT 1`)
				.run();
		}
	}
};
