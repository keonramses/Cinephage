/**
 * Protocol Handlers Module
 *
 * Provides protocol-specific handlers for torrent, usenet, and streaming indexers.
 * Each handler manages protocol-specific operations including validation, scoring,
 * URL generation, and display formatting.
 */

// Base interface and types
export {
	type IProtocolHandler,
	type ITorrentHandler,
	type IUsenetHandler,
	type IStreamingHandler,
	type ProtocolContext,
	type ProtocolDisplayInfo,
	type TorrentHealth,
	type StreamVariant,
	type StreamVerification,
	BaseProtocolHandler
} from './IProtocolHandler';

// Protocol handlers
export { TorrentProtocolHandler, getTorrentHandler } from './TorrentProtocolHandler';
export { UsenetProtocolHandler, getUsenetHandler } from './UsenetProtocolHandler';
export { StreamingProtocolHandler, getStreamingHandler } from './StreamingProtocolHandler';

// Re-export protocol types
export type {
	IndexerProtocol,
	TorrentProtocolSettings,
	UsenetProtocolSettings,
	StreamingProtocolSettings
} from '../types/protocol';

import type { IndexerProtocol } from '../types/protocol';
import type { IProtocolHandler } from './IProtocolHandler';
import { getTorrentHandler } from './TorrentProtocolHandler';
import { getUsenetHandler } from './UsenetProtocolHandler';
import { getStreamingHandler } from './StreamingProtocolHandler';

// =============================================================================
// PROTOCOL HANDLER REGISTRY
// =============================================================================

/**
 * Get the appropriate protocol handler for a given protocol type
 */
export function getProtocolHandler(protocol: IndexerProtocol): IProtocolHandler {
	switch (protocol) {
		case 'torrent':
			return getTorrentHandler();
		case 'usenet':
			return getUsenetHandler();
		case 'streaming':
			return getStreamingHandler();
		default:
			throw new Error(`Unknown protocol: ${protocol}`);
	}
}

/**
 * Check if a protocol is supported
 */
export function isProtocolSupported(protocol: string): protocol is IndexerProtocol {
	return ['torrent', 'usenet', 'streaming'].includes(protocol);
}

/**
 * Get all supported protocols
 */
export function getSupportedProtocols(): IndexerProtocol[] {
	return ['torrent', 'usenet', 'streaming'];
}

/**
 * Protocol handler registry for dependency injection
 */
export class ProtocolHandlerRegistry {
	private handlers: Map<IndexerProtocol, IProtocolHandler> = new Map();

	constructor() {
		// Initialize with default handlers
		this.registerHandler('torrent', getTorrentHandler());
		this.registerHandler('usenet', getUsenetHandler());
		this.registerHandler('streaming', getStreamingHandler());
	}

	/**
	 * Register a protocol handler
	 */
	registerHandler(protocol: IndexerProtocol, handler: IProtocolHandler): void {
		this.handlers.set(protocol, handler);
	}

	/**
	 * Get a protocol handler
	 */
	getHandler(protocol: IndexerProtocol): IProtocolHandler | undefined {
		return this.handlers.get(protocol);
	}

	/**
	 * Check if a handler is registered for a protocol
	 */
	hasHandler(protocol: IndexerProtocol): boolean {
		return this.handlers.has(protocol);
	}

	/**
	 * Get all registered protocols
	 */
	getRegisteredProtocols(): IndexerProtocol[] {
		return Array.from(this.handlers.keys());
	}
}

// Singleton registry
let registryInstance: ProtocolHandlerRegistry | null = null;

/**
 * Get the global protocol handler registry
 */
export function getProtocolRegistry(): ProtocolHandlerRegistry {
	if (!registryInstance) {
		registryInstance = new ProtocolHandlerRegistry();
	}
	return registryInstance;
}
