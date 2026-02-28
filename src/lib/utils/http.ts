export async function readResponsePayload<T = unknown>(
	response: Response
): Promise<T | string | null> {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

	if (contentType.includes('application/json')) {
		return (await response.json().catch(() => null)) as T | null;
	}

	const text = await response.text().catch(() => '');
	const trimmed = text.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function getResponseErrorMessage(payload: unknown, fallback: string): string {
	if (!payload) {
		return fallback;
	}

	if (typeof payload === 'string') {
		if (/cross-site/i.test(payload) && /forbidden/i.test(payload)) {
			return 'Request blocked by origin/CSRF protection. Check ORIGIN and reverse proxy configuration.';
		}

		return payload;
	}

	if (typeof payload !== 'object') {
		return fallback;
	}

	const record = payload as Record<string, unknown>;
	const nestedData =
		record.data && typeof record.data === 'object'
			? (record.data as Record<string, unknown>)
			: null;

	const candidates = [
		record.error,
		record.message,
		nestedData?.error,
		nestedData?.message,
		nestedData?.rootFolderError,
		nestedData?.indexerError
	];

	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim().length > 0) {
			return candidate;
		}
	}

	return fallback;
}
