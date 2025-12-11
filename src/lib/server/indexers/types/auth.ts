/**
 * Authentication Types
 *
 * Defines authentication methods and configurations for indexers.
 * Supports cookie, API key, form-based, passkey, and no-auth modes.
 */

// =============================================================================
// AUTH METHOD ENUM & TYPE
// =============================================================================

/**
 * Supported authentication methods for indexers.
 * - none: Public indexer, no authentication required
 * - cookie: Browser cookie string authentication
 * - apikey: API key (in header or URL parameter)
 * - form: Username/password form login
 * - passkey: Passkey embedded in download URLs
 * - basic: HTTP Basic authentication
 */
export type AuthMethod = 'none' | 'cookie' | 'apikey' | 'form' | 'passkey' | 'basic';

/**
 * Auth method enum for runtime checks
 */
export const AuthMethods = {
	None: 'none' as const,
	Cookie: 'cookie' as const,
	ApiKey: 'apikey' as const,
	Form: 'form' as const,
	Passkey: 'passkey' as const,
	Basic: 'basic' as const
} as const;

/**
 * All valid auth method values
 */
export const ALL_AUTH_METHODS: AuthMethod[] = [
	'none',
	'cookie',
	'apikey',
	'form',
	'passkey',
	'basic'
];

// =============================================================================
// AUTH CONFIGURATION TYPES
// =============================================================================

/**
 * Base authentication configuration
 */
export interface BaseAuthConfig {
	/** The authentication method */
	method: AuthMethod;
}

/**
 * No authentication required
 */
export interface NoAuthConfig extends BaseAuthConfig {
	method: 'none';
}

/**
 * Cookie-based authentication
 */
export interface CookieAuthConfig extends BaseAuthConfig {
	method: 'cookie';
	/** Raw cookie string from browser */
	cookie: string;
	/** Optional: specific cookies required for auth */
	requiredCookies?: string[];
}

/**
 * API key authentication
 */
export interface ApiKeyAuthConfig extends BaseAuthConfig {
	method: 'apikey';
	/** The API key value */
	apiKey: string;
	/** Where to send the API key */
	location: 'header' | 'query' | 'body';
	/** Parameter/header name for the API key */
	paramName: string;
}

/**
 * Form-based authentication (username/password)
 */
export interface FormAuthConfig extends BaseAuthConfig {
	method: 'form';
	/** Username */
	username: string;
	/** Password */
	password: string;
	/** Login URL path */
	loginPath?: string;
	/** Additional form fields */
	extraFields?: Record<string, string>;
	/** CAPTCHA handling method if required */
	captchaHandler?: 'manual' | 'service';
}

/**
 * Passkey authentication (embedded in URLs)
 */
export interface PasskeyAuthConfig extends BaseAuthConfig {
	method: 'passkey';
	/** The passkey value */
	passkey: string;
	/** Parameter name in download URLs */
	paramName: string;
}

/**
 * HTTP Basic authentication
 */
export interface BasicAuthConfig extends BaseAuthConfig {
	method: 'basic';
	/** Username */
	username: string;
	/** Password */
	password: string;
}

/**
 * Union of all auth configurations
 */
export type AuthConfig =
	| NoAuthConfig
	| CookieAuthConfig
	| ApiKeyAuthConfig
	| FormAuthConfig
	| PasskeyAuthConfig
	| BasicAuthConfig;

// =============================================================================
// AUTH DEFINITION CONFIGS (for indexer definitions)
// =============================================================================

/**
 * Definition-level auth config base
 * These describe what fields an indexer uses for auth, not the actual values.
 */
export interface DefinitionAuthConfigBase {
	method: AuthMethod;
}

/**
 * Definition-level cookie auth config
 */
export interface DefinitionCookieAuthConfig extends DefinitionAuthConfigBase {
	method: 'cookie';
	/** Setting field name that holds the cookie value */
	cookieSelector?: string;
	/** Required cookies for validation */
	requiredCookies?: string[];
}

/**
 * Definition-level API key auth config
 */
export interface DefinitionApiKeyAuthConfig extends DefinitionAuthConfigBase {
	method: 'apikey';
	/** Setting field name that holds the API key */
	keyName?: string;
	/** Where to place the API key */
	placement?: 'header' | 'query' | 'body';
	/** Header/query param name */
	paramName?: string;
}

/**
 * Definition-level passkey auth config
 */
export interface DefinitionPasskeyAuthConfig extends DefinitionAuthConfigBase {
	method: 'passkey';
	/** Setting field name that holds the passkey */
	passkeyParam?: string;
}

/**
 * Definition-level form auth config
 */
export interface DefinitionFormAuthConfig extends DefinitionAuthConfigBase {
	method: 'form';
	/** Login path */
	loginPath?: string;
	/** Form field name for username */
	usernameField?: string;
	/** Form field name for password */
	passwordField?: string;
	/** Test path to verify login */
	testPath?: string;
	/** Success selector for login verification */
	successSelector?: string;
}

/**
 * Definition-level auth config (union)
 */
export type DefinitionAuthConfig =
	| { method: 'none' }
	| DefinitionCookieAuthConfig
	| DefinitionApiKeyAuthConfig
	| DefinitionPasskeyAuthConfig
	| DefinitionFormAuthConfig
	| { method: 'basic' };

// =============================================================================
// AUTH STATE & SESSION
// =============================================================================

/**
 * Current authentication state
 */
export interface AuthState {
	/** Whether authentication is currently valid */
	isAuthenticated: boolean;
	/** When the authentication was last validated */
	lastValidated?: Date;
	/** When the authentication expires (if known) */
	expiresAt?: Date;
	/** Active session cookies (for cookie/form auth) */
	sessionCookies?: Record<string, string>;
	/** Error message if authentication failed */
	error?: string;
}

/**
 * Stored authentication session
 */
export interface StoredAuthSession {
	/** Indexer ID this session belongs to */
	indexerId: string;
	/** Auth method used */
	method: AuthMethod;
	/** Session cookies */
	cookies: Record<string, string>;
	/** When the session was created */
	createdAt: Date;
	/** When the session expires */
	expiresAt: Date;
	/** User agent used when creating session */
	userAgent?: string;
}

// =============================================================================
// AUTH RESULT TYPES
// =============================================================================

/**
 * Result of an authentication attempt
 */
export interface AuthResult {
	/** Whether authentication succeeded */
	success: boolean;
	/** Cookies to use for subsequent requests */
	cookies?: Record<string, string>;
	/** Headers to use for subsequent requests */
	headers?: Record<string, string>;
	/** Error message if authentication failed */
	error?: string;
	/** Error type for programmatic handling */
	errorType?: 'invalid_credentials' | 'captcha_required' | 'rate_limited' | 'network' | 'unknown';
	/** Retry after (seconds) if rate limited */
	retryAfter?: number;
}

/**
 * Result of testing authentication
 */
export interface AuthTestResult {
	/** Whether authentication is valid */
	valid: boolean;
	/** Human-readable status message */
	message: string;
	/** Username if logged in */
	username?: string;
	/** Additional info from the indexer */
	info?: Record<string, unknown>;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if auth config is cookie-based
 */
export function isCookieAuth(config: AuthConfig): config is CookieAuthConfig {
	return config.method === 'cookie';
}

/**
 * Check if auth config is API key based
 */
export function isApiKeyAuth(config: AuthConfig): config is ApiKeyAuthConfig {
	return config.method === 'apikey';
}

/**
 * Check if auth config is form-based
 */
export function isFormAuth(config: AuthConfig): config is FormAuthConfig {
	return config.method === 'form';
}

/**
 * Check if auth config is passkey-based
 */
export function isPasskeyAuth(config: AuthConfig): config is PasskeyAuthConfig {
	return config.method === 'passkey';
}

/**
 * Check if auth config is HTTP basic
 */
export function isBasicAuth(config: AuthConfig): config is BasicAuthConfig {
	return config.method === 'basic';
}

/**
 * Check if auth config requires no authentication
 */
export function isNoAuth(config: AuthConfig): config is NoAuthConfig {
	return config.method === 'none';
}

/**
 * Check if an auth method requires credentials
 */
export function requiresCredentials(method: AuthMethod): boolean {
	return method !== 'none';
}

/**
 * Check if an auth method value is valid
 */
export function isValidAuthMethod(value: string): value is AuthMethod {
	return ALL_AUTH_METHODS.includes(value as AuthMethod);
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a no-auth configuration
 */
export function createNoAuthConfig(): NoAuthConfig {
	return { method: 'none' };
}

/**
 * Create a cookie auth configuration
 */
export function createCookieAuthConfig(cookie: string): CookieAuthConfig {
	return { method: 'cookie', cookie };
}

/**
 * Create an API key auth configuration
 */
export function createApiKeyAuthConfig(
	apiKey: string,
	location: 'header' | 'query' | 'body' = 'query',
	paramName: string = 'apikey'
): ApiKeyAuthConfig {
	return { method: 'apikey', apiKey, location, paramName };
}

/**
 * Create a form auth configuration
 */
export function createFormAuthConfig(username: string, password: string): FormAuthConfig {
	return { method: 'form', username, password };
}

/**
 * Create a passkey auth configuration
 */
export function createPasskeyAuthConfig(
	passkey: string,
	paramName: string = 'passkey'
): PasskeyAuthConfig {
	return { method: 'passkey', passkey, paramName };
}

/**
 * Create a basic auth configuration
 */
export function createBasicAuthConfig(username: string, password: string): BasicAuthConfig {
	return { method: 'basic', username, password };
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert user settings to auth config based on available fields
 */
export function settingsToAuthConfig(settings: Record<string, string>): AuthConfig {
	// Check for API key first (most common for semi-private)
	if (settings.apikey || settings.apiKey || settings.api_key) {
		return createApiKeyAuthConfig(
			settings.apikey || settings.apiKey || settings.api_key,
			'query',
			'apikey'
		);
	}

	// Check for cookie
	if (settings.cookie) {
		return createCookieAuthConfig(settings.cookie);
	}

	// Check for passkey
	if (settings.passkey) {
		return createPasskeyAuthConfig(settings.passkey);
	}

	// Check for username/password
	if (settings.username && settings.password) {
		return createFormAuthConfig(settings.username, settings.password);
	}

	// No auth
	return createNoAuthConfig();
}

/**
 * Parse a cookie string into a cookie object
 */
export function parseCookieString(cookieStr: string): Record<string, string> {
	const cookies: Record<string, string> = {};
	for (const part of cookieStr.split(';')) {
		const [key, value] = part.trim().split('=');
		if (key && value !== undefined) {
			cookies[key.trim()] = value.trim();
		}
	}
	return cookies;
}

/**
 * Serialize a cookie object to a cookie string
 */
export function serializeCookies(cookies: Record<string, string>): string {
	return Object.entries(cookies)
		.map(([key, value]) => `${key}=${value}`)
		.join('; ');
}
