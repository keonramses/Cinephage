/**
 * Captcha Solver Module
 *
 * Patchright-primary, Playwright-fallback browser session acquisition.
 */

export { CaptchaSolver, getCaptchaSolver } from './CaptchaSolver';
export {
	CaptchaSolverSettingsService,
	captchaSolverSettingsService
} from './CaptchaSolverSettings';

export type {
	BrowserBackend,
	BrowserFetchRequest,
	BrowserFetchResult,
	BrowserFailureKind,
	ChallengeType,
	ChallengeDetectionResult,
	SolveResult,
	SolveRequest,
	CachedSolveResult,
	CaptchaSolverConfig,
	ProxyConfig,
	SolverStats,
	SolverHealth
} from './types';

export { DEFAULT_CONFIG } from './types';

export { isChallengeLikely, getChallengeDescription } from './detection/ChallengeDetector';

export { getPatchrightManager, shutdownPatchrightManager } from './browser/PatchrightManager';
export { getPlaywrightManager, shutdownPlaywrightManager } from './browser/PlaywrightManager';

export { browserFetch } from './browser/PatchrightSolver';
