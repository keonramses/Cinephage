/**
 * API Key Authentication Provider
 *
 * Handles authentication using API keys.
 * API keys can be sent in headers, query parameters, or request body.
 */

import { BaseAuthProvider, type AuthContext, type AuthRequestResponse } from './IAuthProvider';
import type { AuthConfig, AuthResult, AuthTestResult, ApiKeyAuthConfig } from '../../types';
import { isApiKeyAuth } from '../../types';

/**
 * Provider for API key authentication
 */
export class ApiKeyAuthProvider extends BaseAuthProvider {
	readonly method = 'apikey';

	/**
	 * Authenticate using API key
	 * API keys are provided directly, so we just validate they exist
	 */
	async authenticate(_context: AuthContext, config: AuthConfig): Promise<AuthResult> {
		if (!isApiKeyAuth(config)) {
			return this.failureResult('Invalid config for API key auth', 'invalid_credentials');
		}

		if (!config.apiKey || config.apiKey.trim() === '') {
			return this.failureResult('No API key provided', 'invalid_credentials');
		}

		// API key auth doesn't use cookies, it uses headers or query params
		// Return empty cookies but indicate success
		return this.successResult({}, this.buildAuthHeaders(config));
	}

	/**
	 * Test API key authentication by making a request
	 */
	async test(context: AuthContext, config: AuthConfig): Promise<AuthTestResult> {
		if (!isApiKeyAuth(config)) {
			return {
				valid: false,
				message: 'Invalid config for API key auth'
			};
		}

		if (!config.apiKey || config.apiKey.trim() === '') {
			return {
				valid: false,
				message: 'No API key provided'
			};
		}

		// If we have an HTTP client, test the API key
		if (this.httpClient) {
			try {
				// Build the test URL with API key if using query param
				let testUrl = context.baseUrl;
				const headers: Record<string, string> = {};

				if (config.location === 'query') {
					const url = new URL(testUrl);
					url.searchParams.set(config.paramName, config.apiKey);
					testUrl = url.toString();
				} else if (config.location === 'header') {
					headers[config.paramName] = config.apiKey;
				}

				const response = await this.httpClient.request({
					url: testUrl,
					method: 'GET',
					headers,
					followRedirects: true,
					timeout: 10000
				});

				// Check for API errors
				if (response.status === 401 || response.status === 403) {
					return {
						valid: false,
						message: 'Invalid API key'
					};
				}

				if (response.status >= 400) {
					return {
						valid: false,
						message: `API returned error status: ${response.status}`
					};
				}

				// Try to detect API-specific error messages
				const body = response.body.toLowerCase();
				if (
					body.includes('invalid api') ||
					body.includes('api key') ||
					body.includes('unauthorized')
				) {
					return {
						valid: false,
						message: 'API key appears to be invalid'
					};
				}

				return {
					valid: true,
					message: 'API key authentication successful'
				};
			} catch (error) {
				return {
					valid: false,
					message: `Failed to test API key: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		}

		// Without HTTP client, we can only validate the format
		return {
			valid: true,
			message: 'API key format is valid (connectivity not tested)'
		};
	}

	/**
	 * API key auth typically doesn't have login detection like cookie auth
	 */
	override checkLoginNeeded(response: AuthRequestResponse): boolean {
		// API key auth uses status codes primarily
		return response.status === 401 || response.status === 403;
	}

	/**
	 * Get headers for authenticated requests (if using header location)
	 */
	override getAuthHeaders(config: AuthConfig): Record<string, string> {
		if (!isApiKeyAuth(config)) {
			return {};
		}

		if (config.location === 'header') {
			return { [config.paramName]: config.apiKey };
		}

		return {};
	}

	/**
	 * Build auth headers for the config
	 */
	private buildAuthHeaders(config: ApiKeyAuthConfig): Record<string, string> {
		if (config.location === 'header') {
			return { [config.paramName]: config.apiKey };
		}
		return {};
	}

	/**
	 * Add API key to a URL (for query parameter location)
	 */
	addApiKeyToUrl(url: string, config: AuthConfig): string {
		if (!isApiKeyAuth(config) || config.location !== 'query') {
			return url;
		}

		const urlObj = new URL(url);
		urlObj.searchParams.set(config.paramName, config.apiKey);
		return urlObj.toString();
	}
}
