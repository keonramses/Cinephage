/**
 * Authentication Module
 *
 * Main entry point for the authentication system.
 * Provides unified authentication across all indexer types.
 */

// Re-export all provider types and implementations
export * from './providers';

// Re-export auth types from types module
export type {
	AuthMethod,
	AuthConfig,
	AuthState,
	CookieAuthConfig,
	ApiKeyAuthConfig,
	FormAuthConfig,
	PasskeyAuthConfig,
	BasicAuthConfig
} from '../types';

import type { AuthConfig, AuthState, AuthMethod, AuthResult } from '../types';
import type { IAuthProvider, AuthContext, IAuthHttpClient } from './providers';
import { AuthProviderFactory } from './providers';

// =============================================================================
// AUTH SERVICE
// =============================================================================

/**
 * Convert AuthResult to AuthState
 */
function resultToState(result: AuthResult): AuthState {
	if (result.success) {
		return {
			isAuthenticated: true,
			sessionCookies: result.cookies,
			lastValidated: new Date()
		};
	} else {
		return {
			isAuthenticated: false,
			error: result.error
		};
	}
}

/**
 * High-level authentication service
 *
 * Manages authentication lifecycle for indexers.
 */
export class AuthService {
	private factory: AuthProviderFactory;
	private states: Map<string, AuthState> = new Map();

	constructor(httpClient?: IAuthHttpClient) {
		this.factory = new AuthProviderFactory(httpClient);
	}

	/**
	 * Authenticate an indexer
	 */
	async authenticate(
		indexerId: string,
		config: AuthConfig,
		context: AuthContext
	): Promise<AuthState> {
		const provider = this.factory.getProvider(config.method);
		if (!provider) {
			return {
				isAuthenticated: false,
				error: `Unsupported auth method: ${config.method}`
			};
		}

		try {
			const result = await provider.authenticate(context, config);
			const state = resultToState(result);
			this.states.set(indexerId, state);
			return state;
		} catch (error) {
			const errorState: AuthState = {
				isAuthenticated: false,
				error: error instanceof Error ? error.message : String(error)
			};
			this.states.set(indexerId, errorState);
			return errorState;
		}
	}

	/**
	 * Check if an indexer is currently authenticated
	 */
	isAuthenticated(indexerId: string): boolean {
		const state = this.states.get(indexerId);
		if (!state) return false;
		return state.isAuthenticated && !this.isExpired(state);
	}

	/**
	 * Check if auth state is expired
	 */
	private isExpired(state: AuthState): boolean {
		if (!state.expiresAt) return false;
		return state.expiresAt.getTime() < Date.now();
	}

	/**
	 * Get current auth state for an indexer
	 */
	getState(indexerId: string): AuthState | undefined {
		return this.states.get(indexerId);
	}

	/**
	 * Validate current auth state for an indexer
	 */
	async validateAuth(
		indexerId: string,
		config: AuthConfig,
		context: AuthContext
	): Promise<boolean> {
		const state = this.states.get(indexerId);
		if (!state || !state.isAuthenticated) return false;

		const provider = this.factory.getProvider(config.method);
		if (!provider) return false;

		// Use the test method to validate authentication
		try {
			const testResult = await provider.test(context, config);
			return testResult.valid;
		} catch {
			return false;
		}
	}

	/**
	 * Refresh auth for an indexer
	 */
	async refreshAuth(
		indexerId: string,
		config: AuthConfig,
		context: AuthContext
	): Promise<AuthState> {
		// For now, refreshing auth just means re-authenticating
		// More sophisticated refresh can be added per-provider as needed
		return this.authenticate(indexerId, config, context);
	}

	/**
	 * Clear auth state for an indexer
	 */
	clearAuth(indexerId: string): void {
		this.states.delete(indexerId);
	}

	/**
	 * Clear all auth states
	 */
	clearAllAuth(): void {
		this.states.clear();
	}

	/**
	 * Get a provider for making authenticated requests
	 */
	getProvider(method: AuthMethod): IAuthProvider | undefined {
		return this.factory.getProvider(method);
	}

	/**
	 * Check if a method is supported
	 */
	supportsMethod(method: AuthMethod): boolean {
		return this.factory.supportsMethod(method);
	}
}

// =============================================================================
// SINGLETON
// =============================================================================

let authService: AuthService | null = null;

/**
 * Get the global auth service instance
 */
export function getAuthService(httpClient?: IAuthHttpClient): AuthService {
	if (!authService || httpClient) {
		authService = new AuthService(httpClient);
	}
	return authService;
}

/**
 * Create a new auth service (not the singleton)
 */
export function createAuthService(httpClient?: IAuthHttpClient): AuthService {
	return new AuthService(httpClient);
}
