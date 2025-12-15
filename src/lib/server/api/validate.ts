/**
 * API validation helpers.
 * Reduces boilerplate for Zod validation in API routes.
 *
 * Two patterns are available:
 * 1. Return-based: validateRequestBody() returns { success, data/response }
 * 2. Throw-based: assertFound(), parseBody() throw AppErrors (preferred)
 *
 * The throw-based pattern integrates with hooks.server.ts error handling.
 */

import { json } from '@sveltejs/kit';
import type { z } from 'zod';
import { NotFoundError, ValidationError } from '$lib/errors';

/**
 * Result of validating a request body.
 */
export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; response: Response };

/**
 * Validate a request body against a Zod schema.
 *
 * @example
 * const validation = await validateRequestBody(request, mySchema);
 * if (!validation.success) return validation.response;
 * const { data } = validation;
 */
export async function validateRequestBody<T>(
	request: Request,
	schema: z.ZodSchema<T>
): Promise<ValidationResult<T>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return {
			success: false,
			response: json({ error: 'Invalid JSON body' }, { status: 400 })
		};
	}

	const result = schema.safeParse(body);

	if (!result.success) {
		return {
			success: false,
			response: json(
				{
					error: 'Validation failed',
					details: result.error.flatten()
				},
				{ status: 400 }
			)
		};
	}

	return { success: true, data: result.data };
}

/**
 * Validate URL search params against a Zod schema.
 *
 * @example
 * const validation = validateSearchParams(url.searchParams, mySchema);
 * if (!validation.success) return validation.response;
 * const { data } = validation;
 */
export function validateSearchParams<T>(
	searchParams: URLSearchParams,
	schema: z.ZodSchema<T>
): ValidationResult<T> {
	const params = Object.fromEntries(searchParams.entries());
	const result = schema.safeParse(params);

	if (!result.success) {
		return {
			success: false,
			response: json(
				{
					error: 'Invalid query parameters',
					details: result.error.flatten()
				},
				{ status: 400 }
			)
		};
	}

	return { success: true, data: result.data };
}

/**
 * Create a standard error response.
 */
export function errorResponse(message: string, status: number = 500): Response {
	return json({ error: message }, { status });
}

/**
 * Create a standard success response.
 */
export function successResponse<T>(data: T, status: number = 200): Response {
	return json(data, { status });
}

// =============================================================================
// Throw-based helpers (preferred - integrates with hooks.server.ts error handler)
// =============================================================================

/**
 * Assert that a value exists, throwing NotFoundError if null/undefined.
 *
 * @example
 * const movie = assertFound(await getMovie(id), 'Movie', id);
 * // movie is now guaranteed to be non-null
 */
export function assertFound<T>(
	value: T | null | undefined,
	resource: string,
	id?: string | number
): T {
	if (value === null || value === undefined) {
		throw new NotFoundError(resource, id);
	}
	return value;
}

/**
 * Parse and validate request body, throwing ValidationError if invalid.
 *
 * @example
 * const data = await parseBody(request, movieSchema);
 * // data is typed and validated
 */
export async function parseBody<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ValidationError('Invalid JSON body');
	}

	const result = schema.safeParse(body);
	if (!result.success) {
		throw new ValidationError('Validation failed', {
			details: result.error.flatten()
		});
	}

	return result.data;
}

/**
 * Parse and validate URL search params, throwing ValidationError if invalid.
 *
 * @example
 * const params = parseParams(url.searchParams, querySchema);
 */
export function parseParams<T>(searchParams: URLSearchParams, schema: z.ZodSchema<T>): T {
	const params = Object.fromEntries(searchParams.entries());
	const result = schema.safeParse(params);

	if (!result.success) {
		throw new ValidationError('Invalid query parameters', {
			details: result.error.flatten()
		});
	}

	return result.data;
}

/**
 * Assert a condition, throwing ValidationError if false.
 *
 * @example
 * assertValid(data.title?.length > 0, 'Title is required');
 */
export function assertValid(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new ValidationError(message);
	}
}
