/**
 * Passkey Authentication Provider
 *
 * Handles authentication using passkeys embedded in download URLs.
 * Passkeys are typically unique per-user strings that are appended to download URLs.
 */

import { BaseAuthProvider, type AuthContext, type AuthRequestResponse } from './IAuthProvider';
import type { AuthConfig, AuthResult, AuthTestResult } from '../../types';
import { isPasskeyAuth } from '../../types';

/**
 * Provider for passkey authentication
 */
export class PasskeyAuthProvider extends BaseAuthProvider {
	readonly method = 'passkey';

	/**
	 * Authenticate using passkey
	 * Passkeys are provided directly, so we just validate they exist
	 */
	async authenticate(_context: AuthContext, config: AuthConfig): Promise<AuthResult> {
		if (!isPasskeyAuth(config)) {
			return this.failureResult('Invalid config for passkey auth', 'invalid_credentials');
		}

		if (!config.passkey || config.passkey.trim() === '') {
			return this.failureResult('No passkey provided', 'invalid_credentials');
		}

		// Passkey auth doesn't use cookies or headers - it's embedded in URLs
		return this.successResult();
	}

	/**
	 * Test passkey authentication
	 * Without making an actual download request, we can only validate format
	 */
	async test(_context: AuthContext, config: AuthConfig): Promise<AuthTestResult> {
		if (!isPasskeyAuth(config)) {
			return {
				valid: false,
				message: 'Invalid config for passkey auth'
			};
		}

		if (!config.passkey || config.passkey.trim() === '') {
			return {
				valid: false,
				message: 'No passkey provided'
			};
		}

		// Passkeys are typically long alphanumeric strings
		if (config.passkey.length < 10) {
			return {
				valid: false,
				message: 'Passkey appears too short'
			};
		}

		return {
			valid: true,
			message: 'Passkey format is valid'
		};
	}

	/**
	 * Passkey auth doesn't have login detection - errors occur on download
	 */
	override checkLoginNeeded(_response: AuthRequestResponse): boolean {
		return false;
	}

	/**
	 * Add passkey to a download URL
	 */
	addPasskeyToUrl(url: string, config: AuthConfig): string {
		if (!isPasskeyAuth(config)) {
			return url;
		}

		const urlObj = new URL(url);
		urlObj.searchParams.set(config.paramName, config.passkey);
		return urlObj.toString();
	}
}
