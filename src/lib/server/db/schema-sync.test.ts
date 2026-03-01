import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { syncSchema } from './schema-sync';

const databases: Database.Database[] = [];

function createTestDatabase(): Database.Database {
	const sqlite = new Database(':memory:');
	databases.push(sqlite);
	return sqlite;
}

function getColumnNames(sqlite: Database.Database, tableName: string): string[] {
	return (
		sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
			name: string;
		}>
	).map((column) => column.name);
}

function tableExists(sqlite: Database.Database, tableName: string): boolean {
	return !!sqlite
		.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
		.get(tableName);
}

afterEach(() => {
	for (const sqlite of databases.splice(0)) {
		sqlite.close();
	}
});

describe('syncSchema Better Auth repair', () => {
	it('creates Better Auth plugin tables for a fresh database', () => {
		const sqlite = createTestDatabase();

		syncSchema(sqlite);

		expect(tableExists(sqlite, 'apikey')).toBe(true);
		expect(tableExists(sqlite, 'rateLimit')).toBe(true);
		expect(getColumnNames(sqlite, 'user')).toEqual(
			expect.arrayContaining([
				'email',
				'username',
				'displayUsername',
				'role',
				'banned',
				'banReason',
				'banExpires'
			])
		);
		expect(getColumnNames(sqlite, 'session')).toContain('impersonatedBy');
	});

	it('repairs broken Better Auth tables from an existing schema version', () => {
		const sqlite = createTestDatabase();

		sqlite
			.prepare(
				`CREATE TABLE "user" (
					"id" text PRIMARY KEY NOT NULL,
					"role" text DEFAULT 'admin' NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "session" (
					"id" text PRIMARY KEY NOT NULL,
					"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
					"token" text NOT NULL UNIQUE,
					"expiresAt" date NOT NULL,
					"ipAddress" text,
					"userAgent" text,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "account" (
					"id" text PRIMARY KEY NOT NULL,
					"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
					"accountId" text NOT NULL,
					"providerId" text NOT NULL,
					"accessToken" text,
					"refreshToken" text,
					"accessTokenExpiresAt" date,
					"refreshTokenExpiresAt" date,
					"scope" text,
					"idToken" text,
					"password" text,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(
				`CREATE TABLE "verification" (
					"id" text PRIMARY KEY NOT NULL,
					"identifier" text NOT NULL,
					"value" text NOT NULL,
					"expiresAt" date NOT NULL,
					"createdAt" date,
					"updatedAt" date
				)`
			)
			.run();
		sqlite
			.prepare(`CREATE TABLE "settings" ("key" text PRIMARY KEY NOT NULL, "value" text NOT NULL)`)
			.run();
		sqlite.prepare(`INSERT INTO "settings" ("key", "value") VALUES ('schema_version', '62')`).run();

		syncSchema(sqlite);

		expect(tableExists(sqlite, 'apikey')).toBe(true);
		expect(tableExists(sqlite, 'rateLimit')).toBe(true);
		expect(getColumnNames(sqlite, 'user')).toEqual(
			expect.arrayContaining([
				'name',
				'email',
				'emailVerified',
				'image',
				'username',
				'displayUsername',
				'role',
				'banned',
				'banReason',
				'banExpires',
				'createdAt',
				'updatedAt'
			])
		);
		expect(getColumnNames(sqlite, 'session')).toContain('impersonatedBy');

		const userTable = sqlite
			.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='user'`)
			.get() as { sql: string };
		expect(userTable.sql).toContain('"email" text NOT NULL');
	});

	it('promotes a sole legacy bootstrap user to admin', () => {
		const sqlite = createTestDatabase();

		sqlite
			.prepare(
				`CREATE TABLE "user" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text,
					"email" text NOT NULL,
					"emailVerified" integer DEFAULT 0,
					"image" text,
					"username" text UNIQUE,
					"displayUsername" text,
					"role" text DEFAULT 'admin' NOT NULL,
					"banned" integer DEFAULT 0,
					"banReason" text,
					"banExpires" date,
					"createdAt" date NOT NULL,
					"updatedAt" date NOT NULL
				)`
			)
			.run();
		sqlite
			.prepare(`CREATE TABLE "settings" ("key" text PRIMARY KEY NOT NULL, "value" text NOT NULL)`)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "user" ("id", "email", "username", "role", "createdAt", "updatedAt")
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(
				'user-1',
				'admin@example.com',
				'admin',
				'user',
				'2026-03-01T00:00:00.000Z',
				'2026-03-01T00:00:00.000Z'
			);
		sqlite.prepare(`INSERT INTO "settings" ("key", "value") VALUES ('schema_version', '63')`).run();

		syncSchema(sqlite);

		const row = sqlite.prepare(`SELECT "role" FROM "user" WHERE "id" = 'user-1'`).get() as {
			role: string;
		};

		expect(row.role).toBe('admin');
	});
});
