import { redirect, type RequestEvent } from '@sveltejs/kit';
import Database from 'better-sqlite3';

/**
 * Check if admin setup is complete
 * Queries database every time - no caching to avoid stale state
 */
export async function isSetupComplete(): Promise<boolean> {
	// Check if any users exist in the database
	// Use Better Auth's database directly since it manages the user table
	const authDb = new Database('/root/Cinephage/data/cinephage.db');
	try {
		const result = authDb.prepare('SELECT 1 FROM "user" LIMIT 1').get();
		return !!result;
	} catch {
		// Table doesn't exist yet (first run)
		return false;
	} finally {
		authDb.close();
	}
}

/**
 * Require setup to be incomplete (redirect to dashboard if setup is complete)
 * Use on setup/login pages
 */
export async function requireSetup(event: RequestEvent): Promise<void> {
	const complete = await isSetupComplete();

	if (complete) {
		// Setup is complete, redirect to dashboard
		throw redirect(302, '/');
	}
}

/**
 * Require authentication (redirect to login if not authenticated)
 * Use on protected pages
 */
export async function requireAuth(event: RequestEvent): Promise<void> {
	const complete = await isSetupComplete();

	if (!complete) {
		// Setup not complete, redirect to setup
		throw redirect(302, '/setup');
	}

	// Check if user has a valid session
	// This will be handled by the session validation in hooks.server.ts
	if (!event.locals.session) {
		throw redirect(302, '/login');
	}
}
