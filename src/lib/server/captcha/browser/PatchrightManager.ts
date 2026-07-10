/**
 * Patchright Browser Manager
 *
 * Patchright is a patched Chromium build that removes bot-detection signals at the
 * binary level. Used as the primary browser backend for CF-protected indexers.
 */

import { chromium } from 'patchright';
import type { Browser } from 'playwright-core';
import { BaseBrowserManager, type ManagedBrowser, type BrowserCreateOptions } from './BaseBrowserManager';

export type { ManagedBrowser, BrowserCreateOptions };

export class PatchrightManager extends BaseBrowserManager {
	protected readonly managerName = 'PatchrightManager';

	protected getExecutablePath(): string {
		return chromium.executablePath();
	}

	protected async launchChromium(options: {
		headless: boolean;
		args: string[];
	}): Promise<Browser> {
		// Patchright's chromium mirrors the playwright-core Browser interface.
		// The cast is safe — patchright is a drop-in replacement.
		return chromium.launch(options) as unknown as Browser;
	}
}

let instance: PatchrightManager | null = null;

export function getPatchrightManager(): PatchrightManager {
	if (!instance) instance = new PatchrightManager();
	return instance;
}

export async function shutdownPatchrightManager(): Promise<void> {
	if (instance) {
		await instance.closeAll();
		instance = null;
	}
}
