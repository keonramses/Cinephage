import type { PageServerLoad } from './$types';
import { auth } from '$lib/server/auth/index.js';
import { error } from '@sveltejs/kit';
import { getSystemSettingsService } from '$lib/server/settings/SystemSettingsService.js';
import { decryptApiKey } from '$lib/server/crypto/apiKeyCrypto.js';
import { db } from '$lib/server/db';
import { userApiKeySecrets } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Get all API keys for the current user
		const apiKeysResult = await auth.api.listApiKeys({
			headers: request.headers
		});

		// Find main and media streaming keys
		const mainApiKey = apiKeysResult.find((key) => key.metadata?.type === 'main') || null;
		const streamingApiKey = apiKeysResult.find((key) => key.metadata?.type === 'streaming') || null;

		// Fetch encrypted keys from database and decrypt them
		const encryptedMainKey = mainApiKey
			? await db.query.userApiKeySecrets.findFirst({
					where: eq(userApiKeySecrets.id, mainApiKey.id)
				})
			: null;
		const encryptedStreamingKey = streamingApiKey
			? await db.query.userApiKeySecrets.findFirst({
					where: eq(userApiKeySecrets.id, streamingApiKey.id)
				})
			: null;

		// Decrypt the keys
		const decryptedMainKey = encryptedMainKey ? decryptApiKey(encryptedMainKey.encryptedKey) : null;
		const decryptedStreamingKey = encryptedStreamingKey
			? decryptApiKey(encryptedStreamingKey.encryptedKey)
			: null;

		// Format the keys for the UI with decrypted full keys
		const formatKey = (
			key: {
				id: string;
				key?: string | null;
				start?: string | null;
				prefix?: string | null;
				createdAt?: Date | null;
				metadata?: Record<string, unknown> | null;
			} | null,
			decryptedKey: string | null
		) => {
			if (!key) return null;
			return {
				id: key.id,
				key: decryptedKey || key.key || `${key.prefix || 'cinephage'}_${key.start || ''}...`,
				createdAt: key.createdAt,
				metadata: key.metadata
			};
		};

		// Get external URL setting
		const settingsService = getSystemSettingsService();
		const externalUrl = await settingsService.getExternalUrl();

		return {
			mainApiKey: formatKey(mainApiKey, decryptedMainKey),
			streamingApiKey: formatKey(streamingApiKey, decryptedStreamingKey),
			externalUrl
		};
	} catch (err) {
		console.error('Error loading system settings:', err);
		return {
			mainApiKey: null,
			streamingApiKey: null,
			externalUrl: null,
			error: 'Failed to load system settings'
		};
	}
};
