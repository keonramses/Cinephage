import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function isPathWithinRoot(pathToCheck: string, rootPath: string): boolean {
	const normalizedPath = resolve(pathToCheck);
	const normalizedRoot = resolve(rootPath);
	if (normalizedPath === normalizedRoot) {
		return true;
	}
	return normalizedPath.startsWith(normalizedRoot + '/');
}

/**
 * Resolve a media-relative path under a root folder and ensure it does not escape the root.
 */
export function resolvePathWithinRoot(rootPath: string, relativePath: string): string {
	const normalizedRoot = resolve(rootPath);
	const resolvedPath = resolve(join(normalizedRoot, relativePath));

	if (!isPathWithinRoot(resolvedPath, normalizedRoot)) {
		throw new Error(
			`Path traversal detected: ${resolvedPath} is outside root folder ${normalizedRoot}`
		);
	}

	return resolvedPath;
}

/**
 * Delete a directory recursively, constrained to the given root folder.
 */
export async function deleteDirectoryWithinRoot(
	rootPath: string,
	relativePath: string
): Promise<string> {
	const resolvedPath = resolvePathWithinRoot(rootPath, relativePath);
	await rm(resolvedPath, { recursive: true, force: true });
	return resolvedPath;
}
