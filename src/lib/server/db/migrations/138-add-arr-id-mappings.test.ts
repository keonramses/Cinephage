import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../schema-sync.js';
import { tableExists } from '../migration-helpers.js';
import { MIGRATIONS } from './index.js';

const databases: Database.Database[] = [];

afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));

describe('migration 138: arr_id_mappings table', () => {
	it('is registered in schema metadata', () => {
		expect(MIGRATIONS.find(({ version }) => version === 138)?.name).toMatch(/arr_id_mappings/i);
		expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(138);
	});

	it('creates the table with a unique (entity_type, entity_id) index, idempotently', () => {
		const sqlite = new Database(':memory:');
		databases.push(sqlite);

		const migration = MIGRATIONS.find(({ version }) => version === 138)!;
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(tableExists(sqlite, 'arr_id_mappings')).toBe(true);

		sqlite
			.prepare(
				`INSERT INTO arr_id_mappings (entity_type, entity_id, created_at)
				 VALUES ('rootFolder', 'uuid-1', '2026-01-01T00:00:00.000Z')`
			)
			.run();

		expect(() =>
			sqlite
				.prepare(
					`INSERT INTO arr_id_mappings (entity_type, entity_id, created_at)
					 VALUES ('rootFolder', 'uuid-1', '2026-01-01T00:00:00.000Z')`
				)
				.run()
		).toThrow();

		const row = sqlite
			.prepare(
				`SELECT id FROM arr_id_mappings WHERE entity_type = 'rootFolder' AND entity_id = 'uuid-1'`
			)
			.get() as { id: number };
		expect(Number.isInteger(row.id)).toBe(true);
	});
});
