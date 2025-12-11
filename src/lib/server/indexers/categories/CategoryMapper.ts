/**
 * Category mapping utilities.
 * Maps between different indexer category schemes and Newznab standard.
 */

import { Category, isMovieCategory, isTvCategory } from '../types';
import { getRootCategory } from './newznabCategories';

/** Map YTS quality to categories */
export function mapYtsCategory(quality: string): number[] {
	// YTS is always movies
	const cats: number[] = [Category.MOVIE];

	const q = quality.toLowerCase();

	if (q.includes('2160p') || q.includes('4k')) {
		cats.push(Category.MOVIE_UHD);
	} else if (q.includes('1080p')) {
		cats.push(Category.MOVIE_HD);
	} else if (q.includes('720p')) {
		cats.push(Category.MOVIE_HD);
	} else if (q.includes('3d')) {
		cats.push(Category.MOVIE_3D);
	}

	return cats;
}

/** Map 1337x category name to categories */
export function map1337xCategory(categoryName: string): number[] {
	const lower = categoryName.toLowerCase();

	// Movies
	if (lower.includes('movie')) {
		if (lower.includes('uhd') || lower.includes('4k')) {
			return [Category.MOVIE, Category.MOVIE_UHD];
		}
		if (lower.includes('bluray') || lower.includes('hd') || lower.includes('1080')) {
			return [Category.MOVIE, Category.MOVIE_HD];
		}
		if (lower.includes('web')) {
			return [Category.MOVIE, Category.MOVIE_WEBDL];
		}
		return [Category.MOVIE];
	}

	// TV
	if (lower.includes('tv')) {
		if (lower.includes('uhd') || lower.includes('4k')) {
			return [Category.TV, Category.TV_UHD];
		}
		if (lower.includes('hd') || lower.includes('1080')) {
			return [Category.TV, Category.TV_HD];
		}
		return [Category.TV];
	}

	// Anime
	if (lower.includes('anime')) {
		return [Category.TV_ANIME];
	}

	// XXX
	if (lower.includes('xxx') || lower.includes('porn')) {
		return [Category.XXX];
	}

	// Games
	if (lower.includes('game')) {
		return [Category.PC_GAMES];
	}

	// Music
	if (lower.includes('music')) {
		return [Category.AUDIO];
	}

	// Software
	if (lower.includes('software') || lower.includes('app')) {
		return [Category.PC];
	}

	return [];
}

/** Map EZTV quality to TV categories */
export function mapEztvCategory(quality?: string): number[] {
	const cats: number[] = [Category.TV];

	if (!quality) return cats;

	const q = quality.toLowerCase();

	if (q.includes('2160p') || q.includes('4k')) {
		cats.push(Category.TV_UHD);
	} else if (q.includes('1080p')) {
		cats.push(Category.TV_HD);
	} else if (q.includes('720p')) {
		cats.push(Category.TV_HD);
	} else if (q.includes('480p') || q.includes('sdtv')) {
		cats.push(Category.TV_SD);
	}

	return cats;
}

/** Detect quality from title and return appropriate categories */
export function detectQualityCategories(
	title: string,
	baseCategory: 'movie' | 'tv' = 'movie'
): number[] {
	const t = title.toLowerCase();
	const base = baseCategory === 'movie' ? Category.MOVIE : Category.TV;
	const cats: number[] = [base];

	// UHD/4K
	if (t.includes('2160p') || t.includes('4k') || t.includes('uhd')) {
		cats.push(baseCategory === 'movie' ? Category.MOVIE_UHD : Category.TV_UHD);
		return cats;
	}

	// HD
	if (t.includes('1080p') || t.includes('1080i')) {
		cats.push(baseCategory === 'movie' ? Category.MOVIE_HD : Category.TV_HD);
		return cats;
	}

	// 720p (still HD)
	if (t.includes('720p')) {
		cats.push(baseCategory === 'movie' ? Category.MOVIE_HD : Category.TV_HD);
		return cats;
	}

	// BluRay
	if (t.includes('bluray') || t.includes('blu-ray') || t.includes('bdrip')) {
		cats.push(baseCategory === 'movie' ? Category.MOVIE_BLURAY : Category.TV_HD);
		return cats;
	}

	// WEB-DL
	if (t.includes('web-dl') || t.includes('webdl') || t.includes('webrip')) {
		cats.push(baseCategory === 'movie' ? Category.MOVIE_WEBDL : Category.TV_WEBDL);
		return cats;
	}

	// SD
	if (
		t.includes('480p') ||
		t.includes('dvdrip') ||
		t.includes('sdtv') ||
		t.includes('pdtv') ||
		t.includes('hdtv')
	) {
		cats.push(baseCategory === 'movie' ? Category.MOVIE_SD : Category.TV_SD);
		return cats;
	}

	// 3D (movies only)
	if (baseCategory === 'movie' && t.includes('3d')) {
		cats.push(Category.MOVIE_3D);
	}

	return cats;
}

/** Filter categories to only include specific type */
export function filterMovieCategories(categories: number[]): number[] {
	return categories.filter(isMovieCategory);
}

/** Filter categories to only include TV */
export function filterTvCategories(categories: number[]): number[] {
	return categories.filter(isTvCategory);
}

/** Check if any category in the array is a movie category */
export function hasMovieCategory(categories: number[]): boolean {
	return categories.some(isMovieCategory);
}

/** Check if any category in the array is a TV category */
export function hasTvCategory(categories: number[]): boolean {
	return categories.some(isTvCategory);
}

/** Normalize categories to include parent categories */
export function normalizeCategories(categories: number[]): number[] {
	const normalized = new Set<number>();

	for (const cat of categories) {
		normalized.add(cat);
		const root = getRootCategory(cat);
		if (root !== cat) {
			normalized.add(root);
		}
	}

	return Array.from(normalized).sort((a, b) => a - b);
}
