/**
 * Basic HTTP Authentication Provider
 *
 * Handles HTTP Basic authentication using username and password.
 * Credentials are base64 encoded and sent in the Authorization header.
 */

import { BaseAuthProvider, type AuthContext, type AuthRequestResponse } from './IAuthProvider';
import type { AuthConfig, AuthResult, AuthTestResult, BasicAuthConfig } from '../../types';
import { isBasicAuth } from '../../types';

/**
 * Provider for HTTP Basic authentication
 */
export class BasicAuthProvider extends BaseAuthProvider {
	readonly method = 'basic';

	/**
	 * Authenticate using Basic auth
	 */
	async authenticate(_context: AuthContext, config: AuthConfig): Promise<AuthResult> {
		if (!isBasicAuth(config)) {
			return this.failureResult('Invalid config for basic auth', 'invalid_credentials');
		}

		if (!config.username || !config.password) {
			return this.failureResult('Username and password are required', 'invalid_credentials');
		}

		// Build the Authorization header
		const headers = this.buildAuthHeaders(config);

		return this.successResult({}, headers);
	}

	/**
	 * Test Basic authentication
	 */
	async test(context: AuthContext, config: AuthConfig): Promise<AuthTestResult> {
		if (!isBasicAuth(config)) {
			return {
				valid: false,
				message: 'Invalid config for basic auth'
			};
		}

		if (!config.username || !config.password) {
			return {
				valid: false,
				message: 'Username and password are required'
			};
		}

		// If we have an HTTP client, test the credentials
		if (this.httpClient) {
			try {
				const headers = this.buildAuthHeaders(config);

				const response = await this.httpClient.request({
					url: context.baseUrl,
					method: 'GET',
					headers,
					followRedirects: true,
					timeout: 10000
				});

				// Check for auth failure
				if (response.status === 401) {
					return {
						valid: false,
						message: 'Invalid username or password'
					};
				}

				if (response.status === 403) {
					return {
						valid: false,
						message: 'Access forbidden'
					};
				}

				return {
					valid: true,
					message: 'Basic authentication successful',
					username: config.username
				};
			} catch (error) {
				return {
					valid: false,
					message: `Failed to test credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		}

		// Without HTTP client, we can only validate the format
		return {
			valid: true,
			message: 'Credentials format is valid (connectivity not tested)',
			username: config.username
		};
	}

	/**
	 * Check if login is needed
	 */
	override checkLoginNeeded(response: AuthRequestResponse): boolean {
		// Basic auth failures are indicated by 401 status
		if (response.status === 401) {
			// Check for WWW-Authenticate header indicating Basic auth is expected
			const wwwAuth = response.headers['www-authenticate'] || response.headers['WWW-Authenticate'];
			if (wwwAuth && wwwAuth.toLowerCase().includes('basic')) {
				return true;
			}
			return true;
		}
		return false;
	}

	/**
	 * Get Authorization header for authenticated requests
	 */
	override getAuthHeaders(config: AuthConfig): Record<string, string> {
		if (!isBasicAuth(config)) {
			return {};
		}

		return this.buildAuthHeaders(config);
	}

	/**
	 * Build the Authorization header
	 */
	private buildAuthHeaders(config: BasicAuthConfig): Record<string, string> {
		const credentials = `${config.username}:${config.password}`;
		const encoded = Buffer.from(credentials).toString('base64');
		return {
			Authorization: `Basic ${encoded}`
		};
	}
}
