/**
 * Playwright Browser Manager
 *
 * Standard (unpatched) Chromium via playwright-core. Used as a fallback when
 * Patchright is unavailable or fails with a non-challenge error. Does NOT bypass
 * Cloudflare challenges — if a challenge is returned, it propagates as
 * challenge_required to the caller.
 */

import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import { BaseBrowserManager, type ManagedBrowser, type BrowserCreateOptions } from './BaseBrowserManager';

export type { ManagedBrowser, BrowserCreateOptions };

export class PlaywrightManager extends BaseBrowserManager {
	protected readonly managerName = 'PlaywrightManager';

	protected getExecutablePath(): string {
		return chromium.executablePath();
	}

	protected async launchChromium(options: {
		headless: boolean;
		args: string[];
	}): Promise<Browser> {
		return chromium.launch(options);
	}
}

let instance: PlaywrightManager | null = null;

export function getPlaywrightManager(): PlaywrightManager {
	if (!instance) instance = new PlaywrightManager();
	return instance;
}

export async function shutdownPlaywrightManager(): Promise<void> {
	if (instance) {
		await instance.closeAll();
		instance = null;
	}
}
