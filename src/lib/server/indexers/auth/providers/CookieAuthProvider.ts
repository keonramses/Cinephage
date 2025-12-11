/**
 * Cookie Authentication Provider
 *
 * Handles authentication using browser cookies.
 * Users provide their login cookies from the browser (F12 > Application > Cookies).
 */

import { BaseAuthProvider, type AuthContext, type AuthRequestResponse } from './IAuthProvider';
import type { AuthConfig, AuthResult, AuthTestResult } from '../../types';
import { isCookieAuth, parseCookieString, serializeCookies } from '../../types';

/**
 * Provider for cookie-based authentication
 */
export class CookieAuthProvider extends BaseAuthProvider {
	readonly method = 'cookie';

	/**
	 * Authenticate using provided cookies
	 * Cookies are provided directly by the user, so we just validate they exist
	 */
	async authenticate(context: AuthContext, config: AuthConfig): Promise<AuthResult> {
		if (!isCookieAuth(config)) {
			return this.failureResult('Invalid config for cookie auth', 'invalid_credentials');
		}

		if (!config.cookie || config.cookie.trim() === '') {
			return this.failureResult('No cookie provided', 'invalid_credentials');
		}

		// Parse the cookie string
		const cookies = parseCookieString(config.cookie);

		if (Object.keys(cookies).length === 0) {
			return this.failureResult('Invalid cookie format', 'invalid_credentials');
		}

		// Check for required cookies if specified
		if (config.requiredCookies && config.requiredCookies.length > 0) {
			const missingCookies = config.requiredCookies.filter((name) => !cookies[name]);
			if (missingCookies.length > 0) {
				return this.failureResult(
					`Missing required cookies: ${missingCookies.join(', ')}`,
					'invalid_credentials'
				);
			}
		}

		return this.successResult(cookies);
	}

	/**
	 * Test cookie authentication by making a request to the indexer
	 */
	async test(context: AuthContext, config: AuthConfig): Promise<AuthTestResult> {
		if (!isCookieAuth(config)) {
			return {
				valid: false,
				message: 'Invalid config for cookie auth'
			};
		}

		if (!config.cookie || config.cookie.trim() === '') {
			return {
				valid: false,
				message: 'No cookie provided'
			};
		}

		// If we have an HTTP client, we can actually test the cookies
		if (this.httpClient) {
			try {
				const cookies = parseCookieString(config.cookie);
				const response = await this.httpClient.request({
					url: context.baseUrl,
					method: 'GET',
					headers: {
						Cookie: serializeCookies(cookies)
					},
					followRedirects: true,
					timeout: 10000
				});

				// Check if login is needed
				if (this.checkLoginNeeded(response)) {
					return {
						valid: false,
						message: 'Cookies are invalid or expired'
					};
				}

				return {
					valid: true,
					message: 'Cookie authentication successful'
				};
			} catch (error) {
				return {
					valid: false,
					message: `Failed to test cookies: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		}

		// Without HTTP client, we can only validate the format
		const cookies = parseCookieString(config.cookie);
		if (Object.keys(cookies).length === 0) {
			return {
				valid: false,
				message: 'Invalid cookie format'
			};
		}

		return {
			valid: true,
			message: 'Cookie format is valid (connectivity not tested)'
		};
	}

	/**
	 * Check if login is needed based on response
	 */
	override checkLoginNeeded(response: AuthRequestResponse): boolean {
		// First check parent implementation
		if (super.checkLoginNeeded(response)) {
			return true;
		}

		// Additional checks for cookie auth
		const body = response.body.toLowerCase();

		// Check for common login page indicators
		const loginPageIndicators = [
			'<form',
			'name="password"',
			'id="password"',
			'type="password"',
			'login-form',
			'loginform'
		];

		// If we see a password field on the page, we're probably on a login page
		const hasLoginForm = loginPageIndicators.some((indicator) => body.includes(indicator));
		if (hasLoginForm && body.includes('login')) {
			return true;
		}

		return false;
	}

	/**
	 * Get cookies for authenticated requests
	 */
	override getAuthCookies(config: AuthConfig): Record<string, string> {
		if (!isCookieAuth(config)) {
			return {};
		}

		return parseCookieString(config.cookie);
	}
}
