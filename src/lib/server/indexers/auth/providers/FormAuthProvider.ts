/**
 * Form Authentication Provider
 *
 * Handles authentication using username/password form submission.
 * This is the most complex auth type as it requires:
 * 1. Loading the login page
 * 2. Extracting CSRF tokens if present
 * 3. Submitting the form
 * 4. Capturing session cookies
 */

import { BaseAuthProvider, type AuthContext, type IAuthHttpClient } from './IAuthProvider';
import type { AuthConfig, AuthResult, AuthTestResult } from '../../types';
import { isFormAuth } from '../../types';

/**
 * Provider for form-based authentication (username/password)
 */
export class FormAuthProvider extends BaseAuthProvider {
	readonly method = 'form';

	constructor(httpClient: IAuthHttpClient) {
		super(httpClient);
	}

	/**
	 * Authenticate using form submission
	 */
	async authenticate(context: AuthContext, config: AuthConfig): Promise<AuthResult> {
		if (!isFormAuth(config)) {
			return this.failureResult('Invalid config for form auth', 'invalid_credentials');
		}

		if (!config.username || !config.password) {
			return this.failureResult('Username and password are required', 'invalid_credentials');
		}

		if (!this.httpClient) {
			return this.failureResult('HTTP client required for form auth', 'unknown');
		}

		try {
			// Step 1: Load the login page to get any CSRF tokens
			const loginPath = config.loginPath ?? '/login';
			const loginUrl = new URL(loginPath, context.baseUrl).toString();

			const loginPageResponse = await this.httpClient.request({
				url: loginUrl,
				method: 'GET',
				followRedirects: true,
				timeout: 15000
			});

			// Extract CSRF token if present
			const csrfToken = this.extractCsrfToken(loginPageResponse.body);

			// Step 2: Build form data
			const formData = new URLSearchParams();
			formData.set('username', config.username);
			formData.set('password', config.password);

			// Add CSRF token if found
			if (csrfToken) {
				formData.set(csrfToken.name, csrfToken.value);
			}

			// Add any extra fields
			if (config.extraFields) {
				for (const [key, value] of Object.entries(config.extraFields)) {
					formData.set(key, value);
				}
			}

			// Step 3: Submit the form
			const submitResponse = await this.httpClient.request({
				url: loginUrl,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Cookie: this.serializeCookies(loginPageResponse.cookies)
				},
				body: formData.toString(),
				followRedirects: true,
				timeout: 15000
			});

			// Step 4: Check if login was successful
			if (this.checkLoginNeeded(submitResponse)) {
				// Check for specific error messages
				const errorMessage = this.extractLoginError(submitResponse.body);
				return this.failureResult(
					errorMessage ?? 'Login failed - invalid credentials or unknown error',
					'invalid_credentials'
				);
			}

			// Merge cookies from both responses
			const allCookies = {
				...loginPageResponse.cookies,
				...submitResponse.cookies
			};

			return this.successResult(allCookies);
		} catch (error) {
			if (error instanceof Error && error.message.includes('rate')) {
				return this.failureResult('Rate limited', 'rate_limited', 60);
			}
			return this.failureResult(
				`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'network'
			);
		}
	}

	/**
	 * Test form authentication
	 */
	async test(context: AuthContext, config: AuthConfig): Promise<AuthTestResult> {
		if (!isFormAuth(config)) {
			return {
				valid: false,
				message: 'Invalid config for form auth'
			};
		}

		if (!config.username || !config.password) {
			return {
				valid: false,
				message: 'Username and password are required'
			};
		}

		// Actually try to authenticate
		const authResult = await this.authenticate(context, config);

		if (authResult.success) {
			return {
				valid: true,
				message: 'Form authentication successful',
				username: config.username
			};
		}

		return {
			valid: false,
			message: authResult.error ?? 'Authentication failed'
		};
	}

	/**
	 * Check for CAPTCHA requirement
	 */
	private checkForCaptcha(html: string): boolean {
		const captchaIndicators = [
			'captcha',
			'recaptcha',
			'hcaptcha',
			'g-recaptcha',
			'h-captcha',
			'cf-turnstile'
		];

		const lowerHtml = html.toLowerCase();
		return captchaIndicators.some((indicator) => lowerHtml.includes(indicator));
	}

	/**
	 * Extract CSRF token from HTML
	 */
	private extractCsrfToken(html: string): { name: string; value: string } | null {
		// Common CSRF token patterns
		const patterns = [
			// Meta tag pattern
			/<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
			/<meta\s+content="([^"]+)"\s+name="csrf-token"/i,
			// Hidden input patterns
			/<input[^>]+name="csrf[_-]?token"[^>]+value="([^"]+)"/i,
			/<input[^>]+value="([^"]+)"[^>]+name="csrf[_-]?token"/i,
			/<input[^>]+name="_token"[^>]+value="([^"]+)"/i,
			/<input[^>]+name="authenticity_token"[^>]+value="([^"]+)"/i,
			/<input[^>]+name="__RequestVerificationToken"[^>]+value="([^"]+)"/i
		];

		for (const pattern of patterns) {
			const match = html.match(pattern);
			if (match) {
				// Determine the token name based on pattern
				if (pattern.source.includes('_token')) {
					return { name: '_token', value: match[1] };
				}
				if (pattern.source.includes('authenticity_token')) {
					return { name: 'authenticity_token', value: match[1] };
				}
				if (pattern.source.includes('__RequestVerificationToken')) {
					return { name: '__RequestVerificationToken', value: match[1] };
				}
				return { name: 'csrf_token', value: match[1] };
			}
		}

		return null;
	}

	/**
	 * Extract login error message from response
	 */
	private extractLoginError(html: string): string | null {
		// Common error message patterns
		const patterns = [
			/<div[^>]+class="[^"]*error[^"]*"[^>]*>([^<]+)</i,
			/<span[^>]+class="[^"]*error[^"]*"[^>]*>([^<]+)</i,
			/<p[^>]+class="[^"]*error[^"]*"[^>]*>([^<]+)</i,
			/class="[^"]*alert[^"]*danger[^"]*"[^>]*>([^<]+)</i
		];

		for (const pattern of patterns) {
			const match = html.match(pattern);
			if (match) {
				return match[1].trim();
			}
		}

		// Check for CAPTCHA
		if (this.checkForCaptcha(html)) {
			return 'CAPTCHA required - please login in browser and provide cookies instead';
		}

		return null;
	}

	/**
	 * Serialize cookies to header string
	 */
	private serializeCookies(cookies: Record<string, string>): string {
		return Object.entries(cookies)
			.map(([key, value]) => `${key}=${value}`)
			.join('; ');
	}

	/**
	 * Get cookies for authenticated requests
	 * Form auth stores cookies from the authenticate() result
	 */
	override getAuthCookies(_config: AuthConfig): Record<string, string> {
		// Form auth cookies are returned from authenticate() and should be stored externally
		return {};
	}
}
