/**
 * Newznab category definitions.
 * Standard category numbering used by most indexers.
 */

import { Category } from '../types';

/** Category metadata */
export interface CategoryInfo {
	id: number;
	name: string;
	parentId?: number;
}

/** Standard Newznab categories */
export const NEWZNAB_CATEGORIES: CategoryInfo[] = [
	// Console (1xxx)
	{ id: 1000, name: 'Console' },
	{ id: 1010, name: 'Console/NDS', parentId: 1000 },
	{ id: 1020, name: 'Console/PSP', parentId: 1000 },
	{ id: 1030, name: 'Console/Wii', parentId: 1000 },
	{ id: 1040, name: 'Console/Xbox', parentId: 1000 },
	{ id: 1050, name: 'Console/Xbox 360', parentId: 1000 },
	{ id: 1060, name: 'Console/Wiiware', parentId: 1000 },
	{ id: 1070, name: 'Console/Xbox 360 DLC', parentId: 1000 },
	{ id: 1080, name: 'Console/PS3', parentId: 1000 },
	{ id: 1090, name: 'Console/Other', parentId: 1000 },
	{ id: 1110, name: 'Console/3DS', parentId: 1000 },
	{ id: 1120, name: 'Console/PS Vita', parentId: 1000 },
	{ id: 1130, name: 'Console/WiiU', parentId: 1000 },
	{ id: 1140, name: 'Console/Xbox One', parentId: 1000 },
	{ id: 1150, name: 'Console/PS4', parentId: 1000 },

	// Movies (2xxx)
	{ id: 2000, name: 'Movies' },
	{ id: 2010, name: 'Movies/Foreign', parentId: 2000 },
	{ id: 2020, name: 'Movies/Other', parentId: 2000 },
	{ id: 2030, name: 'Movies/SD', parentId: 2000 },
	{ id: 2040, name: 'Movies/HD', parentId: 2000 },
	{ id: 2045, name: 'Movies/UHD', parentId: 2000 },
	{ id: 2050, name: 'Movies/BluRay', parentId: 2000 },
	{ id: 2060, name: 'Movies/3D', parentId: 2000 },
	{ id: 2070, name: 'Movies/WEB-DL', parentId: 2000 },

	// Audio (3xxx)
	{ id: 3000, name: 'Audio' },
	{ id: 3010, name: 'Audio/MP3', parentId: 3000 },
	{ id: 3020, name: 'Audio/Video', parentId: 3000 },
	{ id: 3030, name: 'Audio/Audiobook', parentId: 3000 },
	{ id: 3040, name: 'Audio/Lossless', parentId: 3000 },
	{ id: 3050, name: 'Audio/Other', parentId: 3000 },
	{ id: 3060, name: 'Audio/Foreign', parentId: 3000 },

	// PC (4xxx)
	{ id: 4000, name: 'PC' },
	{ id: 4010, name: 'PC/0day', parentId: 4000 },
	{ id: 4020, name: 'PC/ISO', parentId: 4000 },
	{ id: 4030, name: 'PC/Mac', parentId: 4000 },
	{ id: 4040, name: 'PC/Mobile-Other', parentId: 4000 },
	{ id: 4050, name: 'PC/Games', parentId: 4000 },
	{ id: 4060, name: 'PC/Mobile-iOS', parentId: 4000 },
	{ id: 4070, name: 'PC/Mobile-Android', parentId: 4000 },

	// TV (5xxx)
	{ id: 5000, name: 'TV' },
	{ id: 5010, name: 'TV/WEB-DL', parentId: 5000 },
	{ id: 5020, name: 'TV/Foreign', parentId: 5000 },
	{ id: 5030, name: 'TV/SD', parentId: 5000 },
	{ id: 5040, name: 'TV/HD', parentId: 5000 },
	{ id: 5045, name: 'TV/UHD', parentId: 5000 },
	{ id: 5050, name: 'TV/Other', parentId: 5000 },
	{ id: 5060, name: 'TV/Sport', parentId: 5000 },
	{ id: 5070, name: 'TV/Anime', parentId: 5000 },
	{ id: 5080, name: 'TV/Documentary', parentId: 5000 },

	// XXX (6xxx)
	{ id: 6000, name: 'XXX' },
	{ id: 6010, name: 'XXX/DVD', parentId: 6000 },
	{ id: 6020, name: 'XXX/WMV', parentId: 6000 },
	{ id: 6030, name: 'XXX/XviD', parentId: 6000 },
	{ id: 6040, name: 'XXX/x264', parentId: 6000 },
	{ id: 6050, name: 'XXX/Pack', parentId: 6000 },
	{ id: 6060, name: 'XXX/ImgSet', parentId: 6000 },
	{ id: 6070, name: 'XXX/Other', parentId: 6000 },
	{ id: 6080, name: 'XXX/SD', parentId: 6000 },
	{ id: 6090, name: 'XXX/WEB-DL', parentId: 6000 },

	// Books (7xxx)
	{ id: 7000, name: 'Books' },
	{ id: 7010, name: 'Books/Mags', parentId: 7000 },
	{ id: 7020, name: 'Books/EBook', parentId: 7000 },
	{ id: 7030, name: 'Books/Comics', parentId: 7000 },
	{ id: 7040, name: 'Books/Technical', parentId: 7000 },
	{ id: 7050, name: 'Books/Other', parentId: 7000 },
	{ id: 7060, name: 'Books/Foreign', parentId: 7000 },

	// Other (8xxx)
	{ id: 8000, name: 'Other' },
	{ id: 8010, name: 'Other/Misc', parentId: 8000 },
	{ id: 8020, name: 'Other/Hashed', parentId: 8000 }
];

/** Get category info by ID */
export function getCategoryById(id: number): CategoryInfo | undefined {
	return NEWZNAB_CATEGORIES.find((c) => c.id === id);
}

/** Get category name by ID */
export function getCategoryName(id: number): string {
	return getCategoryById(id)?.name ?? `Unknown (${id})`;
}

/** Get parent category ID */
export function getParentCategoryId(id: number): number | undefined {
	return getCategoryById(id)?.parentId;
}

/** Get all subcategories of a parent */
export function getSubcategories(parentId: number): CategoryInfo[] {
	return NEWZNAB_CATEGORIES.filter((c) => c.parentId === parentId);
}

/** Check if a category is a subcategory of another */
export function isSubcategoryOf(categoryId: number, parentId: number): boolean {
	const category = getCategoryById(categoryId);
	if (!category) return false;
	return category.parentId === parentId;
}

/** Get root category for any category */
export function getRootCategory(categoryId: number): number {
	const category = getCategoryById(categoryId);
	if (!category?.parentId) return categoryId;
	return category.parentId;
}

/** Convert category ID to enum (if applicable) */
export function toCategory(id: number): Category | undefined {
	if (Object.values(Category).includes(id as Category)) {
		return id as Category;
	}
	return undefined;
}
