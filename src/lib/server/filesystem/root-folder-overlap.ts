import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export interface RootFolderPathRecord {
	id: string;
	path: string;
	name?: string;
}

function normalizePath(folderPath: string): string {
	const resolvedPath = resolve(folderPath);
	if (resolvedPath === sep) {
		return resolvedPath;
	}
	return resolvedPath.replace(new RegExp(`\\${sep}+$`), '');
}

export async function canonicalizeRootFolderPath(folderPath: string): Promise<string> {
	try {
		return normalizePath(await realpath(folderPath));
	} catch {
		return normalizePath(folderPath);
	}
}

export function pathsOverlap(pathA: string, pathB: string): boolean {
	const normalizedA = normalizePath(pathA);
	const normalizedB = normalizePath(pathB);

	if (normalizedA === normalizedB) {
		return true;
	}

	if (normalizedA === sep || normalizedB === sep) {
		return true;
	}

	return normalizedA.startsWith(normalizedB + sep) || normalizedB.startsWith(normalizedA + sep);
}

export async function findOverlappingRootFolder(
	candidatePath: string,
	existingFolders: RootFolderPathRecord[],
	excludeId?: string
): Promise<RootFolderPathRecord | null> {
	const normalizedCandidatePath = await canonicalizeRootFolderPath(candidatePath);

	for (const folder of existingFolders) {
		if (folder.id === excludeId) {
			continue;
		}

		const normalizedExistingPath = await canonicalizeRootFolderPath(folder.path);
		if (pathsOverlap(normalizedCandidatePath, normalizedExistingPath)) {
			return folder;
		}
	}

	return null;
}

export function getRootFolderOverlapMessage(
	candidatePath: string,
	existingFolder: Pick<RootFolderPathRecord, 'path' | 'name'>
): string {
	const existingLabel = existingFolder.name?.trim() || existingFolder.path;
	return `Root folder path "${candidatePath}" overlaps with existing root folder "${existingLabel}" (${existingFolder.path}). Root folders must not overlap or contain one another.`;
}
