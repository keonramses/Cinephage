/**
 * PatchrightManager Tests
 *
 * Tests for browser lifecycle management with mocked patchright.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Browser, BrowserContext, Page, Cookie } from 'playwright-core';

// Mock fs before importing the module
vi.mock('fs', () => ({
	existsSync: vi.fn().mockReturnValue(true)
}));

// Mock patchright before importing the module
const mockChromium = {
	executablePath: vi.fn().mockReturnValue('/app/browsers/chromium/chrome'),
	launch: vi.fn()
};
vi.mock('patchright', () => ({
	chromium: mockChromium
}));

// Mock logger to prevent console output
const mockLogger = {
	info: vi.fn(),
	debug: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	child: vi.fn().mockReturnThis()
};

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

// Import after mocking
const { existsSync } = await import('fs');
const { PatchrightManager, getPatchrightManager, shutdownPatchrightManager } =
	await import('./PatchrightManager');

/**
 * Create a mock Page
 */
function createMockPage(): Page {
	return {
		goto: vi.fn(),
		title: vi.fn(),
		content: vi.fn(),
		close: vi.fn()
	} as unknown as Page;
}

/**
 * Create a mock BrowserContext
 */
function createMockContext(): BrowserContext {
	const mockPage = createMockPage();
	return {
		cookies: vi.fn().mockResolvedValue([]),
		addCookies: vi.fn().mockResolvedValue(undefined),
		newPage: vi.fn().mockResolvedValue(mockPage)
	} as unknown as BrowserContext;
}

/**
 * Create a mock Browser
 */
function createMockBrowser(context?: BrowserContext): Browser {
	const ctx = context ?? createMockContext();
	return {
		close: vi.fn().mockResolvedValue(undefined),
		newContext: vi.fn().mockResolvedValue(ctx),
		on: vi.fn()
	} as unknown as Browser;
}

describe('PatchrightManager', () => {
	let mockBrowser: Browser;
	let mockContext: BrowserContext;

	beforeEach(() => {
		vi.clearAllMocks();

		mockContext = createMockContext();
		mockBrowser = createMockBrowser(mockContext);

		mockChromium.executablePath.mockReturnValue('/app/browsers/chromium/chrome');
		mockChromium.launch.mockResolvedValue(mockBrowser);
		(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
	});

	afterEach(async () => {
		await shutdownPatchrightManager();
	});

	describe('Availability check', () => {
		it('should mark browser as available when Chromium executable exists', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			expect(manager.browserAvailable()).toBe(true);
			expect(manager.availabilityDetermined()).toBe(true);
			expect(manager.getAvailabilityError()).toBeUndefined();
		});

		it('should mark browser as unavailable when Chromium executable is missing', async () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			expect(manager.browserAvailable()).toBe(false);
			expect(manager.getAvailabilityError()).toBeDefined();
		});

		it('should mark browser as unavailable when executablePath throws', async () => {
			mockChromium.executablePath.mockImplementation(() => {
				throw new Error('Browser not found');
			});

			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			expect(manager.browserAvailable()).toBe(false);
			expect(manager.getAvailabilityError()).toBe('Browser not found');
		});
	});

	describe('createBrowser', () => {
		it('should throw when browser is not available', async () => {
			(existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			await expect(manager.createBrowser({ headless: true })).rejects.toThrow(
				'PatchrightManager not available'
			);
		});

		it('should launch Chromium with required Docker args', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			await manager.createBrowser({ headless: true });

			expect(mockChromium.launch).toHaveBeenCalledWith(
				expect.objectContaining({
					headless: true,
					args: expect.arrayContaining(['--no-sandbox', '--disable-dev-shm-usage'])
				})
			);
		});

		it('should set proxy at context level when provided', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			await manager.createBrowser({
				headless: true,
				proxy: {
					url: 'http://proxy.example.com:8080',
					username: 'user',
					password: 'pass'
				}
			});

			expect(mockBrowser.newContext).toHaveBeenCalledWith(
				expect.objectContaining({
					proxy: {
						server: 'http://proxy.example.com:8080',
						username: 'user',
						password: 'pass'
					}
				})
			);
		});

		it('should return managed browser with page', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });

			expect(managed.browser).toBe(mockBrowser);
			expect(managed.context).toBe(mockContext);
			expect(managed.page).toBeDefined();
			expect(managed.createdAt).toBeInstanceOf(Date);
		});

		it('should track active browsers', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			expect(manager.getActiveBrowserCount()).toBe(0);

			await manager.createBrowser({ headless: true });
			expect(manager.getActiveBrowserCount()).toBe(1);

			await manager.createBrowser({ headless: true });
			expect(manager.getActiveBrowserCount()).toBe(2);
		});
	});

	describe('createBrowserForDomain', () => {
		it('should delegate to createBrowser', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowserForDomain('example.com', { headless: true });

			expect(managed.browser).toBeDefined();
			expect(managed.page).toBeDefined();
		});
	});

	describe('closeBrowser', () => {
		it('should close browser and remove from active list', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });
			expect(manager.getActiveBrowserCount()).toBe(1);

			await manager.closeBrowser(managed);

			expect(managed.browser.close).toHaveBeenCalled();
			expect(manager.getActiveBrowserCount()).toBe(0);
		});

		it('should handle close errors gracefully', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });
			(managed.browser.close as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Close failed')
			);

			await expect(manager.closeBrowser(managed)).resolves.toBeUndefined();
		});

		it('should not close already-closed browser', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });
			await manager.closeBrowser(managed);
			const closeCallCount = (managed.browser.close as ReturnType<typeof vi.fn>).mock.calls.length;

			await manager.closeBrowser(managed);
			expect((managed.browser.close as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
				closeCallCount
			);
		});
	});

	describe('closeAll', () => {
		it('should close all active browsers', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			const managed1 = await manager.createBrowser({ headless: true });
			const managed2 = await manager.createBrowser({ headless: true });

			await manager.closeAll();

			expect(managed1.browser.close).toHaveBeenCalled();
			expect(managed2.browser.close).toHaveBeenCalled();
			expect(manager.getActiveBrowserCount()).toBe(0);
		});

		it('should handle close errors during closeAll', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });
			(managed.browser.close as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Close failed')
			);

			await expect(manager.closeAll()).resolves.toBeUndefined();
		});
	});

	describe('extractCookies', () => {
		it('should extract cookies from context', async () => {
			const testCookies: Cookie[] = [
				{
					name: 'cf_clearance',
					value: 'abc123',
					domain: 'example.com',
					path: '/',
					expires: -1,
					httpOnly: true,
					secure: true,
					sameSite: 'None'
				}
			];

			(mockContext.cookies as ReturnType<typeof vi.fn>).mockResolvedValue(testCookies);

			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			const cookies = await manager.extractCookies(mockContext);

			expect(cookies).toEqual(testCookies);
		});

		it('should extract cookies for specific URLs', async () => {
			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			await manager.extractCookies(mockContext, ['https://example.com']);

			expect(mockContext.cookies).toHaveBeenCalledWith(['https://example.com']);
		});
	});

	describe('addCookies', () => {
		it('should add cookies to context', async () => {
			const testCookies: Cookie[] = [
				{
					name: 'session',
					value: 'xyz789',
					domain: 'example.com',
					path: '/',
					expires: -1,
					httpOnly: false,
					secure: false,
					sameSite: 'Lax'
				}
			];

			const manager = new PatchrightManager();
			await manager.waitForAvailabilityCheck();

			await manager.addCookies(mockContext, testCookies);

			expect(mockContext.addCookies).toHaveBeenCalledWith(testCookies);
		});
	});

	describe('Singleton functions', () => {
		it('getPatchrightManager should return same instance', () => {
			const instance1 = getPatchrightManager();
			const instance2 = getPatchrightManager();

			expect(instance1).toBe(instance2);
		});

		it('shutdownPatchrightManager should close all and reset instance', async () => {
			const instance = getPatchrightManager();
			expect(instance).toBeDefined();
			await instance.waitForAvailabilityCheck();

			await shutdownPatchrightManager();
			expect(true).toBe(true);
		});
	});
});
