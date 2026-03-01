export { auth, validateUsername, generateDisplayUsername, RESERVED_USERNAMES } from './auth.js';
export { isSetupComplete, requireSetup, requireAuth } from './setup.js';
export {
	checkApiKeyPermission,
	requireApiKeyPermission,
	type Permission,
	type PermissionSet
} from './permissions.js';
export {
	isAdmin,
	requireAdmin,
	getUserRole,
	hasPermission,
	isAuthenticated,
	getUser,
	type UserRole
} from './authorization.js';
export {
	ac,
	admin,
	user,
	type UserRole as AccessControlUserRole
} from '$lib/auth/access-control.js';
export type { AuthType } from './auth.js';
