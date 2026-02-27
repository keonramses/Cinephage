import { createAuthClient } from 'better-auth/svelte';
import { usernameClient } from 'better-auth/client/plugins';

/**
 * Better Auth client for Svelte
 * Username-based authentication
 *
 * This is the client-side auth client - import from $lib/auth/client
 * NOT from $lib/server/auth/client
 */
export const authClient = createAuthClient({
	basePath: '/api/auth',
	plugins: [usernameClient()]
});

// Export types
type AuthClient = typeof authClient;
export type { AuthClient };
