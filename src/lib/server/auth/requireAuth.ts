import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Require authentication for API routes
 * Returns 401 response if user is not authenticated
 *
 * Usage in +server.ts:
 * ```typescript
 * export const GET: RequestHandler = async (event) => {
 *   const authError = requireAuth(event);
 *   if (authError) return authError;
 *   // ... handle request
 * };
 * ```
 */
export function requireAuth(event: RequestEvent): Response | null {
	if (!event.locals.user) {
		return json(
			{
				success: false,
				error: 'Unauthorized. Authentication required.',
				code: 'UNAUTHORIZED'
			},
			{ status: 401 }
		);
	}
	return null;
}

/**
 * Type guard to check if user is authenticated
 */
export function isAuthenticated(event: RequestEvent): boolean {
	return !!event.locals.user;
}

/**
 * Get current user from event locals
 * Throws error if user is not authenticated (for use after requireAuth check)
 */
export function getUser(event: RequestEvent) {
	if (!event.locals.user) {
		throw new Error('User not authenticated');
	}
	return event.locals.user;
}
