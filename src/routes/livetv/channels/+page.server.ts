import type { ServerLoad } from '@sveltejs/kit';
import { auth } from '$lib/server/auth/index.js';
import { error } from '@sveltejs/kit';
import { decryptApiKey } from '$lib/server/crypto/apiKeyCrypto.js';
import { db } from '$lib/server/db';
import { userApiKeySecrets } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const load: ServerLoad = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Get all API keys for the current user
		const apiKeysResult = await auth.api.listApiKeys({
			headers: request.headers
		});

		// Find media streaming key
		const streamingApiKey = apiKeysResult.find((key) => key.metadata?.type === 'streaming') || null;

		// Fetch encrypted key from database and decrypt it
		const encryptedStreamingKey = streamingApiKey
			? await db.query.userApiKeySecrets.findFirst({
					where: eq(userApiKeySecrets.id, streamingApiKey.id)
				})
			: null;

		// Decrypt the key
		const decryptedStreamingKey = encryptedStreamingKey
			? decryptApiKey(encryptedStreamingKey.encryptedKey)
			: null;

		return {
			streamingApiKey: decryptedStreamingKey
		};
	} catch (err) {
		console.error('Error loading streaming API key:', err);
		return {
			streamingApiKey: null,
			error: 'Failed to load streaming API key'
		};
	}
};
