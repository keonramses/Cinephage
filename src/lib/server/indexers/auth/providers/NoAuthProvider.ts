/**
 * No Authentication Provider
 *
 * Handles public indexers that require no authentication.
 */

import { BaseAuthProvider, type AuthContext, type AuthRequestResponse } from './IAuthProvider';
import type { AuthConfig, AuthResult, AuthTestResult } from '../../types';

/**
 * Provider for indexers that require no authentication
 */
export class NoAuthProvider extends BaseAuthProvider {
	readonly method = 'none';

	/**
	 * No authentication needed - always succeeds
	 */
	async authenticate(_context: AuthContext, _config: AuthConfig): Promise<AuthResult> {
		return this.successResult();
	}

	/**
	 * No authentication to test - always valid
	 */
	async test(_context: AuthContext, _config: AuthConfig): Promise<AuthTestResult> {
		return {
			valid: true,
			message: 'Public indexer - no authentication required'
		};
	}

	/**
	 * Public indexers don't require login
	 */
	checkLoginNeeded(_response: AuthRequestResponse): boolean {
		return false;
	}
}
