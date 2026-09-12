import type { MigrationDefinition } from '../migration-helpers.js';
import { tableExists } from '../migration-helpers.js';

export const migration_v138: MigrationDefinition = {
	version: 138,
	name: 'add_arr_id_mappings',
	apply: (sqlite) => {
		if (!tableExists(sqlite, 'arr_id_mappings')) {
			sqlite
				.prepare(
					`CREATE TABLE "arr_id_mappings" (
						"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
						"entity_type" text NOT NULL,
						"entity_id" text NOT NULL,
						"created_at" text NOT NULL
					)`
				)
				.run();
		}
		sqlite
			.prepare(
				`CREATE UNIQUE INDEX IF NOT EXISTS "idx_arr_id_mappings_entity"
				 ON "arr_id_mappings" ("entity_type", "entity_id")`
			)
			.run();
	}
};
