/**
 * Authentication Providers
 *
 * Exports all authentication providers and utilities.
 */

// Provider interface and base
export {
	type IAuthProvider,
	type AuthContext,
	type AuthRequestOptions,
	type AuthRequestResponse,
	type IAuthHttpClient,
	BaseAuthProvider
} from './IAuthProvider';

// Concrete providers
export { NoAuthProvider } from './NoAuthProvider';
export { CookieAuthProvider } from './CookieAuthProvider';
export { ApiKeyAuthProvider } from './ApiKeyAuthProvider';
export { PasskeyAuthProvider } from './PasskeyAuthProvider';
export { FormAuthProvider } from './FormAuthProvider';
export { BasicAuthProvider } from './BasicAuthProvider';

// Factory
export {
	AuthProviderFactory,
	getAuthProvider,
	getAuthProviderFactory,
	createAuthProviderForMethod
} from './AuthProviderFactory';
