/**
 * Validation utilities for form fields.
 * Provides reusable validators and validation helpers.
 */

export interface ValidationResult {
	valid: boolean;
	error: string | null;
}

/**
 * Validates that a value is not empty.
 */
export function required(value: unknown, message = 'This field is required'): ValidationResult {
	const isEmpty =
		value === null ||
		value === undefined ||
		value === '' ||
		(Array.isArray(value) && value.length === 0);

	return {
		valid: !isEmpty,
		error: isEmpty ? message : null
	};
}

/**
 * Validates that a string is a valid URL.
 */
export function isValidUrl(value: string, message = 'Please enter a valid URL'): ValidationResult {
	if (!value) {
		return { valid: true, error: null }; // Empty is valid (use required() for mandatory)
	}

	try {
		const url = new URL(value);
		const valid = url.protocol === 'http:' || url.protocol === 'https:';
		return {
			valid,
			error: valid ? null : message
		};
	} catch {
		return { valid: false, error: message };
	}
}

/**
 * Validates that a number is within a range.
 */
export function inRange(
	value: number,
	min: number,
	max: number,
	message?: string
): ValidationResult {
	const valid = value >= min && value <= max;
	return {
		valid,
		error: valid ? null : (message ?? `Value must be between ${min} and ${max}`)
	};
}

/**
 * Validates minimum length for strings.
 */
export function minLength(value: string, min: number, message?: string): ValidationResult {
	const valid = value.length >= min;
	return {
		valid,
		error: valid ? null : (message ?? `Must be at least ${min} characters`)
	};
}

/**
 * Validates maximum length for strings.
 */
export function maxLength(value: string, max: number, message?: string): ValidationResult {
	const valid = value.length <= max;
	return {
		valid,
		error: valid ? null : (message ?? `Must be at most ${max} characters`)
	};
}

/**
 * Validates against a regex pattern.
 */
export function pattern(
	value: string,
	regex: RegExp,
	message = 'Invalid format'
): ValidationResult {
	if (!value) {
		return { valid: true, error: null };
	}
	const valid = regex.test(value);
	return {
		valid,
		error: valid ? null : message
	};
}

/**
 * Validates a number is positive.
 */
export function positive(value: number, message = 'Must be a positive number'): ValidationResult {
	const valid = value > 0;
	return {
		valid,
		error: valid ? null : message
	};
}

/**
 * Validates a number is non-negative (zero or positive).
 */
export function nonNegative(value: number, message = 'Must be zero or positive'): ValidationResult {
	const valid = value >= 0;
	return {
		valid,
		error: valid ? null : message
	};
}

/**
 * Combines multiple validators. Stops at first error.
 */
export function combine(...validators: (() => ValidationResult)[]): ValidationResult {
	for (const validator of validators) {
		const result = validator();
		if (!result.valid) {
			return result;
		}
	}
	return { valid: true, error: null };
}

/**
 * Creates a validator function from multiple rules.
 * Returns the first error message or null if all pass.
 */
export function createValidator<T>(
	rules: Array<(value: T) => ValidationResult>
): (value: T) => string | null {
	return (value: T) => {
		for (const rule of rules) {
			const result = rule(value);
			if (!result.valid) {
				return result.error;
			}
		}
		return null;
	};
}
