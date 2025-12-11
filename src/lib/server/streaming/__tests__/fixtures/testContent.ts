/**
 * Test Content Fixtures
 *
 * Known-good TMDB content for live integration testing.
 * These are popular, long-running titles that are reliably available
 * across streaming providers.
 */

// ============================================================================
// Movie Test Content
// ============================================================================

export interface MovieTestContent {
	tmdbId: string;
	title: string;
	year: number;
	imdbId?: string;
}

/**
 * Popular movies for testing - these should be widely available
 */
export const TEST_MOVIES: MovieTestContent[] = [
	{
		tmdbId: '27205',
		title: 'Inception',
		year: 2010,
		imdbId: 'tt1375666'
	},
	{
		tmdbId: '550',
		title: 'Fight Club',
		year: 1999,
		imdbId: 'tt0137523'
	},
	{
		tmdbId: '299536',
		title: 'Avengers: Infinity War',
		year: 2018,
		imdbId: 'tt4154756'
	},
	{
		tmdbId: '603',
		title: 'The Matrix',
		year: 1999,
		imdbId: 'tt0133093'
	},
	{
		tmdbId: '155',
		title: 'The Dark Knight',
		year: 2008,
		imdbId: 'tt0468569'
	}
];

// ============================================================================
// TV Show Test Content
// ============================================================================

export interface TvTestContent {
	tmdbId: string;
	title: string;
	season: number;
	episode: number;
	imdbId?: string;
}

/**
 * Popular TV shows for testing
 */
export const TEST_TV_SHOWS: TvTestContent[] = [
	{
		tmdbId: '1396',
		title: 'Breaking Bad',
		season: 1,
		episode: 1,
		imdbId: 'tt0903747'
	},
	{
		tmdbId: '1399',
		title: 'Game of Thrones',
		season: 1,
		episode: 1,
		imdbId: 'tt0944947'
	},
	{
		tmdbId: '60625',
		title: 'Rick and Morty',
		season: 1,
		episode: 1,
		imdbId: 'tt2861424'
	},
	{
		tmdbId: '66732',
		title: 'Stranger Things',
		season: 1,
		episode: 1,
		imdbId: 'tt4574334'
	}
];

// ============================================================================
// Anime Test Content
// ============================================================================

export interface AnimeTestContent {
	tmdbId: string;
	title: string;
	season: number;
	episode: number;
	malId?: number;
	anilistId?: number;
}

/**
 * Popular anime for testing AnimeKai provider
 */
export const TEST_ANIME: AnimeTestContent[] = [
	{
		tmdbId: '62104',
		title: 'Attack on Titan',
		season: 1,
		episode: 1,
		malId: 16498,
		anilistId: 16498
	},
	{
		tmdbId: '46260',
		title: 'Naruto',
		season: 1,
		episode: 1,
		malId: 20,
		anilistId: 20
	},
	{
		tmdbId: '37854',
		title: 'One Piece',
		season: 1,
		episode: 1,
		malId: 21,
		anilistId: 21
	}
];

// ============================================================================
// Content That Should NOT Exist
// ============================================================================

/**
 * Content that should not exist - for testing error handling
 */
export const NON_EXISTENT_CONTENT = {
	movie: {
		tmdbId: '9999999999',
		title: 'This Movie Does Not Exist',
		year: 2099
	},
	tv: {
		tmdbId: '9999999999',
		title: 'This Show Does Not Exist',
		season: 1,
		episode: 1
	}
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a random test movie
 */
export function getRandomTestMovie(): MovieTestContent {
	return TEST_MOVIES[Math.floor(Math.random() * TEST_MOVIES.length)];
}

/**
 * Get a random test TV show
 */
export function getRandomTestTvShow(): TvTestContent {
	return TEST_TV_SHOWS[Math.floor(Math.random() * TEST_TV_SHOWS.length)];
}

/**
 * Get the primary test movie (Inception - most reliable)
 */
export function getPrimaryTestMovie(): MovieTestContent {
	return TEST_MOVIES[0]; // Inception
}

/**
 * Get the primary test TV show (Breaking Bad - most reliable)
 */
export function getPrimaryTestTvShow(): TvTestContent {
	return TEST_TV_SHOWS[0]; // Breaking Bad
}
