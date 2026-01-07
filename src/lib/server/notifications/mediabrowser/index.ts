/**
 * MediaBrowser (Jellyfin/Emby) Integration
 *
 * Re-exports for convenient importing.
 */

export { MediaBrowserClient, type MediaBrowserClientConfig } from './MediaBrowserClient';
export { MediaBrowserManager, getMediaBrowserManager } from './MediaBrowserManager';
export { MediaBrowserNotifier, getMediaBrowserNotifier } from './MediaBrowserNotifier';
export * from './types';
