import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.DATA_DIR || 'data';
const SECRET_FILE = join(DATA_DIR, '.auth-secret');
const DEFAULT_BASE_URL = 'http://localhost:5173';

function normalizeUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

function getConfiguredExternalUrl(): string | null {
	const dbPath =
		process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL || join(DATA_DIR, 'cinephage.db');

	if (!existsSync(dbPath)) {
		return null;
	}

	let sqlite: Database.Database | null = null;

	try {
		sqlite = new Database(dbPath, { readonly: true });
		const settingsTable = sqlite
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'`)
			.get();

		if (!settingsTable) {
			return null;
		}

		const row = sqlite
			.prepare(`SELECT "value" FROM "settings" WHERE "key" = 'external_url' LIMIT 1`)
			.get() as { value?: string } | undefined;

		if (!row?.value) {
			return null;
		}

		return normalizeUrl(row.value);
	} catch {
		return null;
	} finally {
		sqlite?.close();
	}
}

/**
 * Get or generate the Better Auth secret
 *
 * Priority:
 * 1. BETTER_AUTH_SECRET environment variable (for power users)
 * 2. Existing secret file (survives restarts)
 * 3. Generate new secret and save to file (first run)
 *
 * This approach works for both Docker and bare-metal deployments.
 * The secret is stored alongside the database in the data directory.
 */
export function getAuthSecret(): string {
	// 1. Environment variable takes precedence
	if (process.env.BETTER_AUTH_SECRET) {
		return process.env.BETTER_AUTH_SECRET;
	}

	// 2. Use existing secret file
	if (existsSync(SECRET_FILE)) {
		return readFileSync(SECRET_FILE, 'utf8').trim();
	}

	// 3. Generate new secret and save it
	const secret = randomBytes(32).toString('base64');
	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(SECRET_FILE, secret, { mode: 0o600 });

	console.log(`[Auth] Generated new auth secret at: ${SECRET_FILE}`);
	return secret;
}

/**
 * Get the base URL for Better Auth
 * Priority:
 * 1. BETTER_AUTH_URL environment variable
 * 2. Saved external URL from system settings
 * 3. Local development fallback
 */
export function getBaseURL(): string {
	if (process.env.BETTER_AUTH_URL?.trim()) {
		return normalizeUrl(process.env.BETTER_AUTH_URL);
	}

	const externalUrl = getConfiguredExternalUrl();
	if (externalUrl) {
		return externalUrl;
	}

	return DEFAULT_BASE_URL;
}
