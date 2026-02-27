import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR || 'data';
const SECRET_FILE = join(DATA_DIR, '.auth-secret');

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

	// eslint-disable-next-line no-console
	console.log(`[Auth] Generated new auth secret at: ${SECRET_FILE}`);
	return secret;
}

/**
 * Get the base URL for Better Auth
 * Falls back to localhost in development
 */
export function getBaseURL(): string {
	return process.env.BETTER_AUTH_URL || 'http://localhost:5173';
}
