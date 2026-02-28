import { describe, expect, it } from 'vitest';
import {
	findOverlappingRootFolder,
	getRootFolderOverlapMessage,
	pathsOverlap
} from './root-folder-overlap.js';

describe('root-folder-overlap', () => {
	it('detects identical paths as overlapping', () => {
		expect(pathsOverlap('/media', '/media')).toBe(true);
	});

	it('detects parent and child paths as overlapping', () => {
		expect(pathsOverlap('/media', '/media/Series')).toBe(true);
		expect(pathsOverlap('/media/Series', '/media')).toBe(true);
	});

	it('does not flag sibling paths as overlapping', () => {
		expect(pathsOverlap('/media/Movies', '/media/Series')).toBe(false);
	});

	it('finds an overlapping folder while excluding the current folder id', async () => {
		const overlap = await findOverlappingRootFolder(
			'/media/Series',
			[
				{ id: '1', path: '/media', name: 'Movies' },
				{ id: '2', path: '/downloads', name: 'Downloads' }
			],
			'2'
		);

		expect(overlap).toEqual({ id: '1', path: '/media', name: 'Movies' });
	});

	it('builds a descriptive overlap message', () => {
		expect(
			getRootFolderOverlapMessage('/media/Series', { path: '/media', name: 'Movies' })
		).toContain('must not overlap');
	});
});
