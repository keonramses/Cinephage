/**
 * Structured logging utilities.
 * Provides consistent JSON-formatted logs with context.
 * Supports both console and file output.
 */

import { fileLogger, type LogCategory, type FileLoggerConfig } from './FileLogger.js';

export type { LogCategory, FileLoggerConfig };
export { fileLogger };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
	correlationId?: string;
	userId?: string;
	workerId?: string;
	workerType?: string;
	logCategory?: LogCategory;
	[key: string]: unknown;
}

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	correlationId?: string;
	workerId?: string;
	workerType?: string;
	error?: {
		message: string;
		stack?: string;
		name?: string;
	};
	[key: string]: unknown;
}

/**
 * Check if we're in development mode.
 */
function isDev(): boolean {
	try {
		return import.meta.env?.DEV ?? process.env.NODE_ENV === 'development';
	} catch {
		return false;
	}
}

/**
 * Whether error stack traces should be included in log output.
 * Defaults to enabled in development, disabled in production.
 * Override with LOG_INCLUDE_STACK=true|false.
 */
function shouldIncludeErrorStack(): boolean {
	const configured = process.env.LOG_INCLUDE_STACK;
	if (configured === 'true' || configured === '1') return true;
	if (configured === 'false' || configured === '0') return false;
	return isDev();
}

/**
 * Formats a log entry as JSON string.
 */
function formatLog(level: LogLevel, message: string, context: LogContext, error?: Error): string {
	const entry: LogEntry = {
		timestamp: new Date().toISOString(),
		level,
		message,
		...context
	};

	if (error) {
		entry.error = {
			message: error.message,
			name: error.name,
			...(shouldIncludeErrorStack() ? { stack: error.stack } : {})
		};
	}

	return JSON.stringify(entry);
}

/**
 * Write to file logger if logCategory specified.
 */
function writeToFile(formatted: string, context: LogContext): void {
	const category = context.logCategory || 'main';
	fileLogger.write(category, formatted);
}

/**
 * Structured logger with JSON output.
 * Writes to both console and file (based on category).
 *
 * @example
 * logger.info('User logged in', { userId: '123', correlationId });
 * logger.error('Failed to fetch', error, { correlationId, path: '/api/foo' });
 * logger.info('Stream started', { category: 'streams', workerId: 'abc123' });
 */
export const logger = {
	/**
	 * Debug level logging (only in development, always to file).
	 */
	debug(message: string, context: LogContext = {}): void {
		const formatted = formatLog('debug', message, context);
		writeToFile(formatted, context);
		if (isDev()) {
			console.debug(formatted);
		}
	},

	/**
	 * Info level logging.
	 */
	info(message: string, context: LogContext = {}): void {
		const formatted = formatLog('info', message, context);
		writeToFile(formatted, context);
		console.info(formatted);
	},

	/**
	 * Warning level logging.
	 */
	warn(message: string, context: LogContext = {}): void {
		const formatted = formatLog('warn', message, context);
		writeToFile(formatted, context);
		console.warn(formatted);
	},

	/**
	 * Error level logging with optional Error object.
	 */
	error(message: string, error?: Error | unknown, context: LogContext = {}): void {
		const err = error instanceof Error ? error : undefined;
		const formatted = formatLog('error', message, context, err);
		writeToFile(formatted, context);
		console.error(formatted);
	}
};

/**
 * Creates a child logger with preset context.
 * Useful for request-scoped logging.
 *
 * @example
 * const reqLogger = createChildLogger({ correlationId, path: '/api/foo' });
 * reqLogger.info('Processing request');
 */
export function createChildLogger(baseContext: LogContext) {
	return {
		debug(message: string, context: LogContext = {}): void {
			logger.debug(message, { ...baseContext, ...context });
		},
		info(message: string, context: LogContext = {}): void {
			logger.info(message, { ...baseContext, ...context });
		},
		warn(message: string, context: LogContext = {}): void {
			logger.warn(message, { ...baseContext, ...context });
		},
		error(message: string, error?: Error | unknown, context: LogContext = {}): void {
			logger.error(message, error, { ...baseContext, ...context });
		}
	};
}
