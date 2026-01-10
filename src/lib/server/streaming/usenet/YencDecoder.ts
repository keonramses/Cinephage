/**
 * YencDecoder - Decodes yEnc encoded Usenet article bodies.
 *
 * yEnc is the standard encoding for binary content on Usenet.
 * Uses a simple byte-by-byte encoding to avoid problematic characters.
 */

import type { YencHeader, YencTrailer, YencDecodeResult } from './types';

const YENC_ESCAPE = 0x3d; // '='
const YENC_OFFSET = 42;
const YENC_NEWLINE = 0x0a; // '\n'
const YENC_CR = 0x0d; // '\r'

/**
 * Parse a key=value pair from yEnc header.
 */
function parseKeyValue(params: string, key: string): string | null {
	const keyPattern = new RegExp(`${key}=([^\\s]+)`);
	const result = params.match(keyPattern);
	return result ? result[1] : null;
}

/**
 * Parse yEnc header line.
 */
function parseHeader(line: string): YencHeader | null {
	if (!line.startsWith('=ybegin ')) {
		return null;
	}

	const params = line.slice(8);
	const header: Partial<YencHeader> = {};

	const lineVal = parseKeyValue(params, 'line');
	if (lineVal) header.line = parseInt(lineVal, 10);

	const sizeVal = parseKeyValue(params, 'size');
	if (sizeVal) header.size = parseInt(sizeVal, 10);

	const partVal = parseKeyValue(params, 'part');
	if (partVal) header.part = parseInt(partVal, 10);

	const totalVal = parseKeyValue(params, 'total');
	if (totalVal) header.total = parseInt(totalVal, 10);

	const nameIdx = params.indexOf('name=');
	if (nameIdx !== -1) {
		header.name = params.slice(nameIdx + 5).trim();
	}

	return header.size !== undefined && header.name ? (header as YencHeader) : null;
}

/**
 * Parse yEnc part header line (for multipart).
 */
function parsePartHeader(line: string): { begin: number; end: number } | null {
	if (!line.startsWith('=ypart ')) {
		return null;
	}

	const beginMatch = line.match(/begin=(\d+)/);
	const endMatch = line.match(/end=(\d+)/);

	if (beginMatch && endMatch) {
		return {
			begin: parseInt(beginMatch[1], 10),
			end: parseInt(endMatch[1], 10)
		};
	}
	return null;
}

/**
 * Parse yEnc trailer line.
 */
function parseTrailer(line: string): YencTrailer | null {
	if (!line.startsWith('=yend ')) {
		return null;
	}

	const trailer: Partial<YencTrailer> = {};

	const sizeMatch = line.match(/size=(\d+)/);
	if (sizeMatch) {
		trailer.size = parseInt(sizeMatch[1], 10);
	}

	const partMatch = line.match(/part=(\d+)/);
	if (partMatch) {
		trailer.part = parseInt(partMatch[1], 10);
	}

	const crcMatch = line.match(/crc32=([a-fA-F0-9]+)/);
	if (crcMatch) {
		trailer.crc32 = crcMatch[1];
	}

	const pcrcMatch = line.match(/pcrc32=([a-fA-F0-9]+)/);
	if (pcrcMatch) {
		trailer.pcrc32 = pcrcMatch[1];
	}

	return trailer.size !== undefined ? (trailer as YencTrailer) : null;
}

/**
 * Decode a single yEnc encoded line.
 */
function decodeLine(line: string): Buffer {
	const output: number[] = [];
	const bytes = Buffer.from(line, 'binary');

	let i = 0;
	while (i < bytes.length) {
		let byte = bytes[i];

		if (byte === YENC_NEWLINE || byte === YENC_CR) {
			i++;
			continue;
		}

		if (byte === YENC_ESCAPE && i + 1 < bytes.length) {
			i++;
			byte = bytes[i];
			byte = (byte - 64 - YENC_OFFSET) & 0xff;
		} else {
			byte = (byte - YENC_OFFSET) & 0xff;
		}

		output.push(byte);
		i++;
	}

	return Buffer.from(output);
}

/**
 * Decode yEnc encoded data.
 *
 * @param data - Raw article body buffer (including yEnc headers)
 * @returns Decoded result with header, trailer, and binary data
 * @throws Error if header or trailer not found
 */
export function decodeYenc(data: Buffer): YencDecodeResult {
	const lines = data.toString('binary').split('\r\n');

	let header: YencHeader | null = null;
	let trailer: YencTrailer | null = null;
	let dataStartLine = 0;
	let dataEndLine = lines.length;

	// Find header (look in first 10 lines)
	for (let i = 0; i < Math.min(10, lines.length); i++) {
		header = parseHeader(lines[i]);
		if (header) {
			dataStartLine = i + 1;

			// Check for =ypart line (multipart)
			if (header.part && dataStartLine < lines.length) {
				const partHeader = parsePartHeader(lines[dataStartLine]);
				if (partHeader) {
					header.begin = partHeader.begin;
					header.end = partHeader.end;
					dataStartLine++;
				}
			}
			break;
		}
	}

	if (!header) {
		throw new Error('No yEnc header found in article body');
	}

	// Find trailer (search from end, last 5 lines)
	for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
		trailer = parseTrailer(lines[i]);
		if (trailer) {
			dataEndLine = i;
			break;
		}
	}

	if (!trailer) {
		throw new Error('No yEnc trailer found in article body');
	}

	// Decode the data lines
	const decodedChunks: Buffer[] = [];

	for (let i = dataStartLine; i < dataEndLine; i++) {
		const line = lines[i];
		if (!line) continue;

		const decoded = decodeLine(line);
		if (decoded.length > 0) {
			decodedChunks.push(decoded);
		}
	}

	return {
		header,
		trailer,
		data: Buffer.concat(decodedChunks)
	};
}

/**
 * Extract only the yEnc header from article body.
 * Useful for getting byte range info without full decode.
 */
export function extractYencHeader(data: Buffer): YencHeader | null {
	// Only look at first 1KB for header
	const preview = data.slice(0, 1024).toString('binary');
	const lines = preview.split('\r\n');

	for (let i = 0; i < Math.min(10, lines.length); i++) {
		const header = parseHeader(lines[i]);
		if (header) {
			// Check for =ypart line
			if (header.part && i + 1 < lines.length) {
				const partHeader = parsePartHeader(lines[i + 1]);
				if (partHeader) {
					header.begin = partHeader.begin;
					header.end = partHeader.end;
				}
			}
			return header;
		}
	}

	return null;
}
