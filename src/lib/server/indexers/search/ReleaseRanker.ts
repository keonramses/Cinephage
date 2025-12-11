import type { ReleaseResult } from '../types';

/**
 * Weights for different ranking factors.
 */
export interface RankingWeights {
	seeders: number;
	freshness: number;
	quality: number;
	size: number;
}

/**
 * Quality levels detected from release titles.
 */
export enum QualityLevel {
	Unknown = 0,
	SD = 1,
	HD720 = 2,
	HD1080 = 3,
	UHD4K = 4
}

/**
 * Default ranking weights.
 */
const DEFAULT_WEIGHTS: RankingWeights = {
	seeders: 0.4,
	freshness: 0.2,
	quality: 0.25,
	size: 0.15
};

/**
 * Ranks releases based on multiple factors.
 */
export class ReleaseRanker {
	private weights: RankingWeights;

	constructor(weights?: Partial<RankingWeights>) {
		this.weights = { ...DEFAULT_WEIGHTS, ...weights };
	}

	/**
	 * Ranks releases and returns them sorted by score (descending).
	 */
	rank(releases: ReleaseResult[]): ReleaseResult[] {
		return releases
			.map((release) => ({
				release,
				score: this.calculateScore(release)
			}))
			.sort((a, b) => b.score - a.score)
			.map(({ release }) => release);
	}

	/**
	 * Calculates a combined score for a release.
	 */
	calculateScore(release: ReleaseResult): number {
		const seederScore = this.calculateSeederScore(release.seeders ?? 0);
		const freshnessScore = this.calculateFreshnessScore(release.publishDate);
		const qualityScore = this.calculateQualityScore(release.title);
		const sizeScore = this.calculateSizeScore(release.size);

		return (
			seederScore * this.weights.seeders +
			freshnessScore * this.weights.freshness +
			qualityScore * this.weights.quality +
			sizeScore * this.weights.size
		);
	}

	/**
	 * Calculates seeder score (0-1).
	 * Uses logarithmic scale to prevent high seeders from dominating.
	 */
	private calculateSeederScore(seeders: number): number {
		if (seeders <= 0) return 0;
		// Log scale: 1 seeder = 0, 10 = 0.33, 100 = 0.66, 1000+ = ~1
		return Math.min(Math.log10(seeders + 1) / 3, 1);
	}

	/**
	 * Calculates freshness score (0-1).
	 * Newer releases score higher, with decay over time.
	 */
	private calculateFreshnessScore(publishDate: Date): number {
		const now = Date.now();
		const ageMs = now - publishDate.getTime();
		const ageDays = ageMs / (1000 * 60 * 60 * 24);

		// Exponential decay: 1.0 at day 0, ~0.5 at 30 days, ~0.1 at 90 days
		return Math.exp(-ageDays / 30);
	}

	/**
	 * Calculates quality score (0-1) based on title analysis.
	 */
	private calculateQualityScore(title: string): number {
		const quality = this.detectQuality(title);

		switch (quality) {
			case QualityLevel.UHD4K:
				return 1.0;
			case QualityLevel.HD1080:
				return 0.8;
			case QualityLevel.HD720:
				return 0.6;
			case QualityLevel.SD:
				return 0.3;
			default:
				return 0.4; // Unknown quality gets middle score
		}
	}

	/**
	 * Calculates size score (0-1).
	 * Prefers releases in a reasonable size range for their quality.
	 */
	private calculateSizeScore(size: number): number {
		if (size <= 0) return 0.5; // Unknown size gets middle score

		const sizeGB = size / (1024 * 1024 * 1024);

		// Optimal range: 2-15 GB for movies
		if (sizeGB >= 2 && sizeGB <= 15) {
			return 0.8 + (Math.min(sizeGB, 10) / 10) * 0.2;
		}

		// Too small might be low quality
		if (sizeGB < 1) {
			return 0.3;
		}

		// Very large might be overkill
		if (sizeGB > 30) {
			return 0.7;
		}

		return 0.6;
	}

	/**
	 * Detects quality level from title.
	 */
	detectQuality(title: string): QualityLevel {
		const lower = title.toLowerCase();

		if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) {
			return QualityLevel.UHD4K;
		}

		if (lower.includes('1080p') || lower.includes('1080i')) {
			return QualityLevel.HD1080;
		}

		if (lower.includes('720p')) {
			return QualityLevel.HD720;
		}

		if (
			lower.includes('480p') ||
			lower.includes('dvdrip') ||
			lower.includes('sdtv') ||
			lower.includes('cam') ||
			lower.includes('ts')
		) {
			return QualityLevel.SD;
		}

		return QualityLevel.Unknown;
	}

	/**
	 * Updates ranking weights.
	 */
	setWeights(weights: Partial<RankingWeights>): void {
		this.weights = { ...this.weights, ...weights };
	}

	/**
	 * Gets current ranking weights.
	 */
	getWeights(): RankingWeights {
		return { ...this.weights };
	}
}
