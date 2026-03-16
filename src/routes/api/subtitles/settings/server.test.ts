import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTestDb, closeTestDb, clearTestDb, getTestDb } from '../../../../test/db-helper';
import { api } from '../../../../test/api-helper';

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis()
}));

initTestDb();

vi.mock('$lib/server/db', () => {
	return {
		get db() {
			return getTestDb().db;
		},
		get sqlite() {
			return getTestDb().sqlite;
		},
		initializeDatabase: vi.fn().mockResolvedValue(undefined)
	};
});

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

const { GET, PUT } = await import('./+server');

describe('Subtitle Settings API', () => {
	beforeAll(() => {
		initTestDb();
	});

	afterAll(() => {
		closeTestDb();
	});

	beforeEach(() => {
		clearTestDb();
	});

	it('does not expose legacy auto-sync settings', async () => {
		const { status, data } = await api.get<{
			defaultLanguageProfileId: string | null;
			defaultFallbackLanguage: string;
			autoSyncEnabled?: boolean;
		}>(GET);

		expect(status).toBe(200);
		expect(data.defaultLanguageProfileId).toBeNull();
		expect(data.defaultFallbackLanguage).toBe('en');
		expect(data).not.toHaveProperty('autoSyncEnabled');
	});

	it('updates remaining subtitle settings without auto-sync fields', async () => {
		const { status, data } = await api.put<{
			defaultLanguageProfileId: string | null;
			defaultFallbackLanguage: string;
			autoSyncEnabled?: boolean;
		}>(PUT, {
			defaultLanguageProfileId: '9a3d9ab6-9bd5-4c40-b8a5-9e035fbaeb49',
			defaultFallbackLanguage: 'es'
		});

		expect(status).toBe(200);
		expect(data.defaultLanguageProfileId).toBe('9a3d9ab6-9bd5-4c40-b8a5-9e035fbaeb49');
		expect(data.defaultFallbackLanguage).toBe('es');
		expect(data).not.toHaveProperty('autoSyncEnabled');
	});
});
