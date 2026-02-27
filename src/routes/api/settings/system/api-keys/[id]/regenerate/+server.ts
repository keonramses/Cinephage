import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth/index.js';
import { encryptApiKey } from '$lib/server/crypto/apiKeyCrypto.js';
import { db } from '$lib/server/db';
import { userApiKeySecrets } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

// POST /api/settings/system/api-keys/[id]/regenerate - Regenerate an API key
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Require authentication
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;
	if (!id) {
		return json({ error: 'API key ID is required' }, { status: 400 });
	}

	try {
		// Get the existing API key
		const existingKey = await auth.api.getApiKey({
			query: { id },
			headers: request.headers
		});

		if (!existingKey) {
			return json({ error: 'API key not found' }, { status: 404 });
		}

		// Verify the key belongs to the current user
		if (existingKey.userId !== locals.user.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Store metadata and permissions for new key
		const { name, metadata, permissions } = existingKey;

		// Delete the old key
		await auth.api.deleteApiKey({
			body: { keyId: id },
			headers: request.headers
		});

		// Create new key with same metadata and permissions
		const newKey = await auth.api.createApiKey({
			body: {
				userId: locals.user.id,
				name: name || 'API Key',
				metadata: metadata || {},
				permissions: permissions || { default: ['*'] }
			}
		});

		// Delete old encrypted key from database
		await db.delete(userApiKeySecrets).where(eq(userApiKeySecrets.id, id));

		// Encrypt and store the new key
		const encryptedKey = encryptApiKey(newKey.key);
		await db.insert(userApiKeySecrets).values({
			id: newKey.id,
			userId: locals.user.id,
			encryptedKey,
			createdAt: new Date().toISOString()
		});

		return json({
			success: true,
			data: {
				id: newKey.id,
				key: newKey.key,
				name: newKey.name,
				metadata: newKey.metadata
			}
		});
	} catch (error) {
		console.error('Error regenerating API key:', error);
		return json({ error: 'Failed to regenerate API key' }, { status: 500 });
	}
};
