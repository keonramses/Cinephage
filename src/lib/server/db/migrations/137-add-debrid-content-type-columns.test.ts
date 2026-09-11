import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../schema-sync.js';
import { MIGRATION_COLUMN_MAP, columnExists } from '../migration-helpers.js';
import { MIGRATIONS } from './index.js';

const databases: Database.Database[] = [];

afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));

describe('migration 137: debrid content-type columns', () => {
	it('is registered in schema and drift metadata', () => {
		expect(MIGRATIONS.find(({ version }) => version === 137)?.name).toMatch(/content_type/i);
		expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(137);
		expect(MIGRATION_COLUMN_MAP[137]).toEqual([
			{ table: 'download_clients', column: 'allow_movies' },
			{ table: 'download_clients', column: 'allow_tv' }
		]);
	});

	it('adds both columns idempotently, defaulting to enabled for existing rows', () => {
		const sqlite = new Database(':memory:');
		databases.push(sqlite);
		sqlite.exec(`
			CREATE TABLE download_clients (
				id text PRIMARY KEY NOT NULL,
				name text NOT NULL,
				implementation text NOT NULL,
				host text NOT NULL,
				port integer NOT NULL
			)
		`);
		sqlite
			.prepare(
				`INSERT INTO download_clients (id, name, implementation, host, port)
				 VALUES ('legacy', 'Legacy Real-Debrid', 'realdebrid', 'api.real-debrid.com', 443)`
			)
			.run();

		const migration = MIGRATIONS.find(({ version }) => version === 137)!;
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(columnExists(sqlite, 'download_clients', 'allow_movies')).toBe(true);
		expect(columnExists(sqlite, 'download_clients', 'allow_tv')).toBe(true);
		expect(
			sqlite
				.prepare(`SELECT allow_movies, allow_tv FROM download_clients WHERE id = 'legacy'`)
				.get()
		).toEqual({ allow_movies: 1, allow_tv: 1 });
	});
});
