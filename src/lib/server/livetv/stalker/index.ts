/**
 * Stalker Portal Module
 *
 * Exports for Stalker/Ministra protocol IPTV integration.
 */

export { StalkerPortalClient, createStalkerClient } from './StalkerPortalClient';
export { StalkerAccountManager, getStalkerAccountManager } from './StalkerAccountManager';
export {
	StalkerChannelSyncService,
	getStalkerChannelSyncService
} from './StalkerChannelSyncService';
export { StalkerChannelService, getStalkerChannelService } from './StalkerChannelService';
