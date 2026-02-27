import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth/index.js';
import { encryptApiKey } from '$lib/server/crypto/apiKeyCrypto.js';
import { db } from '$lib/server/db';
import { userApiKeySecrets } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

// POST /api/settings/system/api-keys - Auto-generate Main and Media Streaming API keys
export const POST: RequestHandler = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Check if user already has API keys
		const existingKeys = await auth.api.listApiKeys({
			headers: request.headers
		});

		const hasMainKey = existingKeys.some((key) => key.metadata?.type === 'main');
		const hasStreamingKey = existingKeys.some((key) => key.metadata?.type === 'streaming');

		const results = {
			mainKey: null as { id: string; key: string } | null,
			streamingKey: null as { id: string; key: string } | null
		};

		// Create Main API Key if doesn't exist
		if (!hasMainKey) {
			const mainKey = await auth.api.createApiKey({
				body: {
					userId: locals.user.id,
					name: 'Main API Key',
					metadata: {
						type: 'main',
						description: 'Full access to all API endpoints'
					},
					permissions: {
						default: ['*']
					}
				}
			});
			results.mainKey = {
				id: mainKey.id,
				key: mainKey.key
			};
			// Encrypt and store the full key
			const encryptedKey = encryptApiKey(mainKey.key);
			await db.insert(userApiKeySecrets).values({
				id: mainKey.id,
				userId: locals.user.id,
				encryptedKey,
				createdAt: new Date().toISOString()
			});
		}

		// Create Media Streaming API Key if doesn't exist
		if (!hasStreamingKey) {
			const streamingKey = await auth.api.createApiKey({
				body: {
					userId: locals.user.id,
					name: 'Media Streaming API Key',
					metadata: {
						type: 'streaming',
						description:
							'Access to Live TV and Media Streaming endpoints for media server integration'
					},
					permissions: {
						livetv: ['*'],
						streaming: ['*']
					}
				}
			});
			results.streamingKey = {
				id: streamingKey.id,
				key: streamingKey.key
			};
			// Encrypt and store the full key
			const encryptedKey = encryptApiKey(streamingKey.key);
			await db.insert(userApiKeySecrets).values({
				id: streamingKey.id,
				userId: locals.user.id,
				encryptedKey,
				createdAt: new Date().toISOString()
			});
		}

		return json({
			success: true,
			data: results
		});
	} catch (error) {
		console.error('Error creating API keys:', error);
		return json({ error: 'Failed to create API keys' }, { status: 500 });
	}
};

// GET /api/settings/system/api-keys - List user's API keys
export const GET: RequestHandler = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const apiKeys = await auth.api.listApiKeys({
			headers: request.headers
		});

		return json({
			success: true,
			data: apiKeys
		});
	} catch (error) {
		console.error('Error listing API keys:', error);
		return json({ error: 'Failed to list API keys' }, { status: 500 });
	}
};
