import type Database from 'better-sqlite3';

function tableExists(sqlite: Database.Database, tableName: string): boolean {
	return !!sqlite
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
		.get(tableName);
}

function columnExists(sqlite: Database.Database, tableName: string, columnName: string): boolean {
	return (
		sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
			name: string;
		}>
	).some((column) => column.name === columnName);
}

/**
 * In Cinephage's single-user bootstrap flow, the sole account must be admin.
 * This repairs older installs where the first account was mistakenly created as "user".
 */
export function ensureSoleUserIsAdmin(sqlite: Database.Database, expectedUserId?: string): boolean {
	if (!tableExists(sqlite, 'user') || !columnExists(sqlite, 'user', 'role')) {
		return false;
	}

	const users = sqlite
		.prepare(`SELECT "id", "role" FROM "user" ORDER BY "createdAt" ASC LIMIT 2`)
		.all() as Array<{ id: string; role: string | null }>;

	if (users.length !== 1) {
		return false;
	}

	const [user] = users;
	if (expectedUserId && user.id !== expectedUserId) {
		return false;
	}

	if (user.role === 'admin') {
		return true;
	}

	if (columnExists(sqlite, 'user', 'updatedAt')) {
		sqlite
			.prepare(`UPDATE "user" SET "role" = 'admin', "updatedAt" = ? WHERE "id" = ?`)
			.run(new Date().toISOString(), user.id);
	} else {
		sqlite.prepare(`UPDATE "user" SET "role" = 'admin' WHERE "id" = ?`).run(user.id);
	}

	return true;
}
