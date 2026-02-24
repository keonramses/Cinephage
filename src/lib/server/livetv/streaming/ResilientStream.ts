/**
 * Resilient Stream Wrapper
 *
 * Simple reconnect-on-death wrapper for direct TS streams from stalker portals.
 * When the upstream connection closes (which is normal -- stalker backends close
 * connections after a server-determined duration), this wrapper calls the stream
 * provider for a fresh URL (with a new single-use play_token) and reconnects.
 *
 * DESIGN PRINCIPLES:
 * 1. Stream until the connection ends naturally -- don't preemptively kill it
 * 2. Reconnect immediately with a fresh token when the connection drops
 * 3. No buffer replay -- replaying old TS data causes backward skipping in players
 * 4. Let the video player's own buffer absorb the brief reconnection gap (~200-500ms)
 * 5. Back off only on actual errors, not on normal connection closures
 *
 * Based on the stalkerhek reconnection pattern: stream -> die -> get new token -> reconnect.
 */

import { logger } from '$lib/logging';
import type { FetchStreamResult } from '$lib/types/livetv';

// Config
const DATA_TIMEOUT_MS = 10_000; // 10 seconds with no data = stalled connection
const INITIAL_DATA_TIMEOUT_MS = 15_000; // 15 seconds for first data (includes createLink + TCP)
const MAX_RECONNECTS = 500; // Safety limit for continuous streaming
const ERROR_BACKOFF_BASE_MS = 1_000; // Base backoff on errors (exponential)
const ERROR_BACKOFF_MAX_MS = 30_000; // Max backoff on consecutive errors
const HEALTH_CHECK_INTERVAL_MS = 1_000; // Check for stalled connections every second

interface StreamProvider {
	(): Promise<FetchStreamResult>;
}

interface Connection {
	reader: ReadableStreamDefaultReader<Uint8Array>;
	startTime: number;
	lastDataTime: number;
	bytesTransferred: number;
	url: string;
}

/**
 * Creates a resilient stream that reconnects on connection death.
 *
 * When the upstream closes the connection (normal for stalker portals),
 * the wrapper fetches a fresh URL and reconnects transparently.
 */
export function createResilientStream(
	lineupItemId: string,
	streamProvider: StreamProvider
): ReadableStream<Uint8Array> {
	let currentConnection: Connection | null = null;
	let isActive = true;
	let reconnectCount = 0;
	let consecutiveErrors = 0;
	let totalBytesTransferred = 0;
	let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			logger.info('[ResilientStream] Starting', { lineupItemId });

			// Health check: detect stalled connections
			healthCheckInterval = setInterval(() => {
				if (!isActive || !currentConnection) return;

				const timeSinceData = Date.now() - currentConnection.lastDataTime;
				const timeout =
					currentConnection.bytesTransferred > 0 ? DATA_TIMEOUT_MS : INITIAL_DATA_TIMEOUT_MS;

				if (timeSinceData > timeout) {
					logger.warn('[ResilientStream] Data timeout, closing stalled connection', {
						lineupItemId,
						connectionAge: Date.now() - currentConnection.startTime,
						bytesTransferred: currentConnection.bytesTransferred,
						timeSinceData
					});
					// Cancel the reader -- the main loop will handle reconnection
					currentConnection.reader.cancel().catch(() => {});
				}
			}, HEALTH_CHECK_INTERVAL_MS);

			// Main streaming loop
			await streamLoop(controller);
		},

		cancel() {
			logger.info('[ResilientStream] Cancelled by client', {
				lineupItemId,
				totalBytesTransferred,
				reconnectCount
			});
			cleanup();
		}
	});

	async function streamLoop(controller: ReadableStreamDefaultController<Uint8Array>) {
		while (isActive && reconnectCount < MAX_RECONNECTS) {
			try {
				// Establish connection
				if (!currentConnection) {
					reconnectCount++;

					logger.info('[ResilientStream] Connecting', {
						lineupItemId,
						attempt: reconnectCount
					});

					const streamResult = await streamProvider();
					const response = streamResult.response;

					if (!response.ok) {
						throw new Error(`HTTP ${response.status}: ${response.statusText}`);
					}

					if (!response.body) {
						throw new Error('Stream has no body');
					}

					currentConnection = {
						reader: response.body.getReader(),
						startTime: Date.now(),
						lastDataTime: Date.now(),
						bytesTransferred: 0,
						url: streamResult.url
					};

					// Successful connection resets error backoff
					consecutiveErrors = 0;

					logger.info('[ResilientStream] Connected', {
						lineupItemId,
						reconnectCount,
						url: streamResult.url.substring(0, 60)
					});
				}

				// Read data from current connection
				const { done, value } = await currentConnection.reader.read();

				if (done) {
					// Normal connection closure -- expected for stalker portals
					const duration = Date.now() - currentConnection.startTime;
					logger.info('[ResilientStream] Connection closed by server', {
						lineupItemId,
						duration,
						bytesTransferred: currentConnection.bytesTransferred,
						reconnectCount
					});
					currentConnection = null;
					// No backoff -- this is normal, reconnect immediately
					continue;
				}

				// Forward data to client
				if (value && value.length > 0) {
					currentConnection.bytesTransferred += value.length;
					currentConnection.lastDataTime = Date.now();
					totalBytesTransferred += value.length;
					controller.enqueue(value);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				// Clean up failed connection
				if (currentConnection) {
					try {
						currentConnection.reader.releaseLock();
					} catch {
						// Ignore cleanup errors
					}
					currentConnection = null;
				}

				// Check if stream was cancelled (not an error)
				if (!isActive) break;

				consecutiveErrors++;

				logger.warn('[ResilientStream] Error', {
					lineupItemId,
					error: message,
					reconnectCount,
					consecutiveErrors
				});

				// Exponential backoff on consecutive errors
				const backoff = Math.min(
					ERROR_BACKOFF_BASE_MS * Math.pow(2, consecutiveErrors - 1),
					ERROR_BACKOFF_MAX_MS
				);

				logger.debug('[ResilientStream] Backing off before retry', {
					lineupItemId,
					backoffMs: backoff,
					consecutiveErrors
				});

				await new Promise((resolve) => setTimeout(resolve, backoff));
			}
		}

		// Stream ended
		cleanup();

		if (reconnectCount >= MAX_RECONNECTS) {
			logger.error('[ResilientStream] Max reconnects reached', {
				lineupItemId,
				maxReconnects: MAX_RECONNECTS,
				totalBytesTransferred
			});
			controller.error(new Error('Max reconnects reached'));
		} else {
			logger.info('[ResilientStream] Stream ended', {
				lineupItemId,
				totalBytesTransferred,
				reconnectCount
			});
			controller.close();
		}
	}

	function cleanup() {
		isActive = false;

		if (healthCheckInterval) {
			clearInterval(healthCheckInterval);
			healthCheckInterval = null;
		}

		if (currentConnection) {
			currentConnection.reader.cancel().catch(() => {});
			currentConnection = null;
		}
	}
}

export { DATA_TIMEOUT_MS, MAX_RECONNECTS, ERROR_BACKOFF_BASE_MS, ERROR_BACKOFF_MAX_MS };
