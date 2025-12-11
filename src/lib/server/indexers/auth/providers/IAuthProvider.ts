/**
 * Authentication Provider Interface
 *
 * Defines the contract for all authentication providers.
 * Each provider handles a specific authentication method.
 */

import type { AuthConfig, AuthResult, AuthTestResult } from '../../types';

/**
 * Context for authentication operations
 */
export interface AuthContext {
	/** Indexer instance ID */
	indexerId: string;
	/** Indexer name for logging */
	indexerName: string;
	/** Base URL of the indexer */
	baseUrl: string;
	/** User-provided settings */
	settings: Record<string, string>;
}

/**
 * Options for HTTP requests during authentication
 */
export interface AuthRequestOptions {
	/** URL to request */
	url: string;
	/** HTTP method */
	method: 'GET' | 'POST';
	/** Headers to include */
	headers?: Record<string, string>;
	/** Request body (for POST) */
	body?: string | URLSearchParams;
	/** Follow redirects */
	followRedirects?: boolean;
	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * Response from an authentication request
 */
export interface AuthRequestResponse {
	/** HTTP status code */
	status: number;
	/** Response headers */
	headers: Record<string, string>;
	/** Response body */
	body: string;
	/** Final URL after redirects */
	finalUrl: string;
	/** Cookies from response */
	cookies: Record<string, string>;
}

/**
 * HTTP client interface for auth providers
 */
export interface IAuthHttpClient {
	/**
	 * Make an HTTP request
	 */
	request(options: AuthRequestOptions): Promise<AuthRequestResponse>;
}

/**
 * Base interface for all authentication providers
 */
export interface IAuthProvider {
	/**
	 * The authentication method this provider handles
	 */
	readonly method: string;

	/**
	 * Authenticate with the indexer
	 * @param context - Authentication context
	 * @param config - Authentication configuration
	 * @returns Authentication result with cookies/headers for subsequent requests
	 */
	authenticate(context: AuthContext, config: AuthConfig): Promise<AuthResult>;

	/**
	 * Test if current authentication is valid
	 * @param context - Authentication context
	 * @param config - Authentication configuration
	 * @returns Test result indicating if auth is still valid
	 */
	test(context: AuthContext, config: AuthConfig): Promise<AuthTestResult>;

	/**
	 * Check if login is needed based on a response
	 * @param response - HTTP response to check
	 * @returns Whether login is needed
	 */
	checkLoginNeeded(response: AuthRequestResponse): boolean;

	/**
	 * Get headers to add to authenticated requests
	 * @param config - Authentication configuration
	 * @returns Headers to add
	 */
	getAuthHeaders(config: AuthConfig): Record<string, string>;

	/**
	 * Get cookies to add to authenticated requests
	 * @param config - Authentication configuration
	 * @returns Cookies to add
	 */
	getAuthCookies(config: AuthConfig): Record<string, string>;
}

/**
 * Base class for authentication providers
 */
export abstract class BaseAuthProvider implements IAuthProvider {
	abstract readonly method: string;

	constructor(protected readonly httpClient?: IAuthHttpClient) {}

	abstract authenticate(context: AuthContext, config: AuthConfig): Promise<AuthResult>;

	abstract test(context: AuthContext, config: AuthConfig): Promise<AuthTestResult>;

	/**
	 * Default implementation - check for common login indicators
	 */
	checkLoginNeeded(response: AuthRequestResponse): boolean {
		// Check for redirect to login page
		if (response.finalUrl.toLowerCase().includes('login')) {
			return true;
		}

		// Check for 401/403 status
		if (response.status === 401 || response.status === 403) {
			return true;
		}

		// Check body for common login indicators
		const body = response.body.toLowerCase();
		const loginIndicators = [
			'please login',
			'please sign in',
			'not logged in',
			'session expired',
			'access denied',
			'authentication required'
		];

		return loginIndicators.some((indicator) => body.includes(indicator));
	}

	/**
	 * Default implementation - no headers
	 */
	getAuthHeaders(_config: AuthConfig): Record<string, string> {
		return {};
	}

	/**
	 * Default implementation - no cookies
	 */
	getAuthCookies(_config: AuthConfig): Record<string, string> {
		return {};
	}

	/**
	 * Helper to create a successful auth result
	 */
	protected successResult(
		cookies?: Record<string, string>,
		headers?: Record<string, string>
	): AuthResult {
		return {
			success: true,
			cookies,
			headers
		};
	}

	/**
	 * Helper to create a failed auth result
	 */
	protected failureResult(
		error: string,
		errorType?: AuthResult['errorType'],
		retryAfter?: number
	): AuthResult {
		return {
			success: false,
			error,
			errorType,
			retryAfter
		};
	}
}
