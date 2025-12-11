/**
 * Authentication Provider Factory
 *
 * Creates appropriate auth providers based on auth method.
 */

import type { IAuthProvider, IAuthHttpClient } from './IAuthProvider';
import type { AuthMethod, AuthConfig } from '../../types';

import { NoAuthProvider } from './NoAuthProvider';
import { CookieAuthProvider } from './CookieAuthProvider';
import { ApiKeyAuthProvider } from './ApiKeyAuthProvider';
import { PasskeyAuthProvider } from './PasskeyAuthProvider';
import { FormAuthProvider } from './FormAuthProvider';
import { BasicAuthProvider } from './BasicAuthProvider';

/**
 * Factory for creating auth providers
 */
export class AuthProviderFactory {
	private providers: Map<AuthMethod, IAuthProvider> = new Map();
	private httpClient?: IAuthHttpClient;

	constructor(httpClient?: IAuthHttpClient) {
		this.httpClient = httpClient;
		this.initializeProviders();
	}

	/**
	 * Initialize all providers
	 */
	private initializeProviders(): void {
		this.providers.set('none', new NoAuthProvider());
		this.providers.set('cookie', new CookieAuthProvider(this.httpClient));
		this.providers.set('apikey', new ApiKeyAuthProvider(this.httpClient));
		this.providers.set('passkey', new PasskeyAuthProvider());
		this.providers.set('basic', new BasicAuthProvider(this.httpClient));

		// Form auth requires HTTP client
		if (this.httpClient) {
			this.providers.set('form', new FormAuthProvider(this.httpClient));
		}
	}

	/**
	 * Get a provider for a specific auth method
	 */
	getProvider(method: AuthMethod): IAuthProvider | undefined {
		return this.providers.get(method);
	}

	/**
	 * Get a provider based on auth config
	 */
	getProviderForConfig(config: AuthConfig): IAuthProvider | undefined {
		return this.providers.get(config.method);
	}

	/**
	 * Check if a method is supported
	 */
	supportsMethod(method: AuthMethod): boolean {
		return this.providers.has(method);
	}

	/**
	 * Get all supported methods
	 */
	getSupportedMethods(): AuthMethod[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * Update the HTTP client (e.g., when creating a new one with different config)
	 */
	setHttpClient(httpClient: IAuthHttpClient): void {
		this.httpClient = httpClient;
		// Reinitialize providers with new client
		this.initializeProviders();
	}
}

// =============================================================================
// SINGLETON & UTILITIES
// =============================================================================

let defaultFactory: AuthProviderFactory | null = null;

/**
 * Get the default auth provider factory
 */
export function getAuthProviderFactory(httpClient?: IAuthHttpClient): AuthProviderFactory {
	if (!defaultFactory || httpClient) {
		defaultFactory = new AuthProviderFactory(httpClient);
	}
	return defaultFactory;
}

/**
 * Get a specific auth provider
 */
export function getAuthProvider(
	method: AuthMethod,
	httpClient?: IAuthHttpClient
): IAuthProvider | undefined {
	return getAuthProviderFactory(httpClient).getProvider(method);
}

/**
 * Create an auth provider for a specific method
 * Returns a new instance (not from the shared factory)
 */
export function createAuthProviderForMethod(
	method: AuthMethod,
	httpClient?: IAuthHttpClient
): IAuthProvider {
	switch (method) {
		case 'none':
			return new NoAuthProvider();
		case 'cookie':
			return new CookieAuthProvider(httpClient);
		case 'apikey':
			return new ApiKeyAuthProvider(httpClient);
		case 'passkey':
			return new PasskeyAuthProvider();
		case 'form':
			if (!httpClient) {
				throw new Error('Form authentication requires an HTTP client');
			}
			return new FormAuthProvider(httpClient);
		case 'basic':
			return new BasicAuthProvider(httpClient);
		default:
			throw new Error(`Unknown auth method: ${method}`);
	}
}
