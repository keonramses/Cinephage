/**
 * Base Browser Manager
 *
 * Abstract base class shared by PatchrightManager and PlaywrightManager.
 * Both implementations provide identical context configuration; only the
 * underlying Chromium launcher differs.
 */

import { existsSync } from 'fs';
import type { Browser, BrowserContext, Page, Cookie } from 'playwright-core';
import { createChildLogger } from '$lib/logging';
import type { ProxyConfig } from '../types';

const logger = createChildLogger({ logDomain: 'indexers' as const });

export interface ManagedBrowser {
	id: string;
	browser: Browser;
	context: BrowserContext;
	page: Page;
	createdAt: Date;
	isClosed: boolean;
}

export interface BrowserCreateOptions {
	headless: boolean;
	proxy?: ProxyConfig;
}

export abstract class BaseBrowserManager {
	private activeBrowsers = new Map<string, ManagedBrowser>();
	protected isAvailable = false;
	protected availabilityError: string | undefined;
	protected availabilityChecked = false;
	private readonly readyPromise: Promise<void>;

	constructor() {
		// Defer so subclass field initializers (managerName) run before checkAvailability reads them.
		this.readyPromise = new Promise((resolve) =>
			queueMicrotask(() => this.checkAvailability().then(resolve))
		);
	}

	protected abstract readonly managerName: string;
	protected abstract getExecutablePath(): string;
	protected abstract launchChromium(options: {
		headless: boolean;
		args: string[];
	}): Promise<Browser>;

	private async checkAvailability(): Promise<void> {
		try {
			const execPath = this.getExecutablePath();
			if (!existsSync(execPath)) {
				throw new Error(
					`Chromium not found at ${execPath}. Ensure the browser is installed for this backend.`
				);
			}
			this.isAvailable = true;
			logger.info({ execPath }, `[${this.managerName}] Chromium available`);
		} catch (error) {
			this.isAvailable = false;
			this.availabilityError = error instanceof Error ? error.message : String(error);
			logger.warn({ error: this.availabilityError }, `[${this.managerName}] Chromium not available`);
		} finally {
			this.availabilityChecked = true;
		}
	}

	async waitForAvailabilityCheck(): Promise<void> {
		await this.readyPromise;
	}

	browserAvailable(): boolean {
		return this.isAvailable;
	}

	availabilityDetermined(): boolean {
		return this.availabilityChecked;
	}

	getAvailabilityError(): string | undefined {
		return this.availabilityError;
	}

	async createBrowser(options: BrowserCreateOptions): Promise<ManagedBrowser> {
		await this.waitForAvailabilityCheck();

		if (!this.isAvailable) {
			throw new Error(
				`${this.managerName} not available: ${this.availabilityError ?? 'unknown error'}`
			);
		}

		const id = crypto.randomUUID();

		const browser = await this.launchChromium({
			headless: options.headless,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-gpu'
			]
		});

		const ctxOptions: Parameters<Browser['newContext']>[0] = {
			viewport: { width: 1920, height: 1080 },
			locale: 'en-US',
			timezoneId: 'America/New_York',
			ignoreHTTPSErrors: true,
			acceptDownloads: false,
			extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
		};

		if (options.proxy) {
			ctxOptions.proxy = {
				server: options.proxy.url,
				username: options.proxy.username,
				password: options.proxy.password
			};
		}

		const context = await browser.newContext(ctxOptions);
		const page = await context.newPage();

		const managed: ManagedBrowser = {
			id,
			browser,
			context,
			page,
			createdAt: new Date(),
			isClosed: false
		};

		this.activeBrowsers.set(id, managed);
		browser.on('disconnected', () => {
			if (!managed.isClosed) {
				managed.isClosed = true;
				this.activeBrowsers.delete(id);
				logger.debug({ id }, `[${this.managerName}] Browser disconnected externally`);
			}
		});

		logger.debug({ id, headless: options.headless }, `[${this.managerName}] Created browser`);
		return managed;
	}

	async createBrowserForDomain(
		_domain: string,
		options: BrowserCreateOptions
	): Promise<ManagedBrowser> {
		return this.createBrowser(options);
	}

	async closeBrowser(managed: ManagedBrowser): Promise<void> {
		if (managed.isClosed) return;
		managed.isClosed = true;
		this.activeBrowsers.delete(managed.id);
		await managed.browser.close().catch(() => {});
		logger.debug({ id: managed.id }, `[${this.managerName}] Closed browser`);
	}

	async closeAll(): Promise<void> {
		const browsers = Array.from(this.activeBrowsers.values());
		this.activeBrowsers.clear();
		await Promise.all(
			browsers.map(async (m) => {
				if (m.isClosed) return;
				m.isClosed = true;
				await m.browser.close().catch(() => {});
			})
		);
		logger.info({ count: browsers.length }, `[${this.managerName}] Closed all browsers`);
	}

	getActiveBrowserCount(): number {
		return this.activeBrowsers.size;
	}

	async extractCookies(context: BrowserContext, urls?: string[]): Promise<Cookie[]> {
		return context.cookies(urls);
	}

	async addCookies(context: BrowserContext, cookies: Cookie[]): Promise<void> {
		await context.addCookies(cookies);
	}
}
