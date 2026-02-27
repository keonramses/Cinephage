/**
 * Server-Sent Events endpoint for real-time task status updates
 *
 * GET /api/tasks/stream
 *
 * Events emitted:
 * - tasks:initial    - Full initial task state
 * - task:started     - A task began execution (scheduled or manual)
 * - task:completed   - A task finished successfully
 * - task:failed      - A task encountered an error
 * - task:cancelled   - A running task was cancelled
 * - task:updated     - Task settings changed (enabled, interval, etc.)
 */

import type { RequestHandler } from './$types';
import { createSSEStream } from '$lib/server/sse';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler';
import { taskSettingsService } from '$lib/server/tasks/TaskSettingsService';
import { taskHistoryService } from '$lib/server/tasks/TaskHistoryService';
import type { TaskResult } from '$lib/server/monitoring/MonitoringScheduler';
import {
	UNIFIED_TASK_DEFINITIONS,
	type UnifiedTask,
	type UnifiedTaskDefinition
} from '$lib/server/tasks/UnifiedTaskRegistry';
import { librarySchedulerService } from '$lib/server/library/index';
import type { TaskHistoryEntry } from '$lib/types/task';

/**
 * SSE event payload types
 */
export interface TaskStartedEvent {
	taskId: string;
	startedAt: string;
}

export interface TaskCompletedEvent {
	taskId: string;
	completedAt: string;
	lastRunTime: string;
	nextRunTime: string | null;
	result?: {
		itemsProcessed: number;
		itemsGrabbed: number;
		errors: number;
	};
	historyEntry?: TaskHistoryEntry;
}

export interface TaskFailedEvent {
	taskId: string;
	completedAt: string;
	error: string;
	historyEntry?: TaskHistoryEntry;
}

export interface TaskCancelledEvent {
	taskId: string;
	cancelledAt: string;
}

export interface TaskUpdatedEvent {
	taskId: string;
	enabled?: boolean;
	intervalHours?: number;
	nextRunTime?: string | null;
}

export interface TasksInitialEvent {
	tasks: UnifiedTask[];
}

/**
 * All events for the tasks stream endpoint
 */
export interface TaskStreamEvents {
	'tasks:initial': TasksInitialEvent;
	'task:started': TaskStartedEvent;
	'task:completed': TaskCompletedEvent;
	'task:failed': TaskFailedEvent;
	'task:cancelled': TaskCancelledEvent;
	'task:updated': TaskUpdatedEvent;
}

/**
 * Get initial task state by querying the database directly.
 * This bypasses the in-memory cache which may not be initialized yet.
 */
async function getInitialTaskState(): Promise<UnifiedTask[]> {
	return await Promise.all(
		UNIFIED_TASK_DEFINITIONS.map(async (def: UnifiedTaskDefinition) => {
			// Get settings from TaskSettingsService (queries DB directly)
			const settings = await taskSettingsService.getTaskSettings(def.id);
			const enabled = settings?.enabled ?? true;
			const intervalHours = settings?.intervalHours ?? def.defaultIntervalHours ?? null;

			if (def.category === 'scheduled') {
				// For scheduled tasks, use the lastRunAt from task_settings (DB)
				// This is always available regardless of MonitoringScheduler initialization
				const lastRunTime = settings?.lastRunAt ?? null;
				const nextRunTime = settings?.nextRunAt ?? null;

				// Check if task is currently running via monitoringScheduler's in-memory Set
				// Note: This relies on the in-memory state, but for initial load it's acceptable
				// because any running tasks will immediately emit task:started events via SSE
				const monitoringStatus = await monitoringScheduler.getStatus();
				const taskKey = def.id as keyof typeof monitoringStatus.tasks;
				const isRunning = monitoringStatus.tasks[taskKey]?.isRunning ?? false;

				return {
					...def,
					lastRunTime,
					nextRunTime,
					intervalHours,
					isRunning,
					enabled
				};
			} else {
				// Get status from TaskHistoryService for maintenance tasks
				const lastRun = await taskHistoryService.getLastRunForTask(def.id);
				let isRunning = taskHistoryService.isTaskRunning(def.id);

				// Special handling for library-scan: check librarySchedulerService for actual running state
				if (def.id === 'library-scan') {
					const libStatus = await librarySchedulerService.getStatus();
					isRunning = libStatus.scanning;
				}

				return {
					...def,
					lastRunTime: lastRun?.completedAt ?? lastRun?.startedAt ?? null,
					nextRunTime: null,
					intervalHours,
					isRunning,
					enabled
				};
			}
		})
	);
}

/**
 * Helper to compute the next run time after a task completes.
 * Reads the interval from settings, calculates based on completion time.
 */
async function getNextRunTimeForTask(taskId: string, completionTime: Date): Promise<string | null> {
	const interval = await taskSettingsService.getTaskInterval(taskId);
	if (interval === null) return null;
	return new Date(completionTime.getTime() + interval * 60 * 60 * 1000).toISOString();
}

/**
 * Fetch the latest history entry for a completed task
 */
async function getCompletedHistoryEntry(taskType: string): Promise<TaskHistoryEntry | undefined> {
	try {
		const lastRun = await taskHistoryService.getLastRunForTask(taskType);
		if (lastRun && lastRun.status === 'completed') {
			return lastRun;
		}
	} catch {
		// Non-critical: skip history entry
	}
	return undefined;
}

/**
 * Fetch the latest history entry for a failed task
 */
async function getFailedHistoryEntry(
	taskType: string,
	error: unknown
): Promise<TaskHistoryEntry | undefined> {
	try {
		const lastRun = await taskHistoryService.getLastRunForTask(taskType);
		if (lastRun && lastRun.status === 'failed') {
			return lastRun;
		}
	} catch {
		// Non-critical: skip history entry
	}
	return undefined;
}

export const GET: RequestHandler = async () => {
	return createSSEStream(async (send) => {
		// Send initial task state immediately (queries DB directly, bypasses cache)
		try {
			const initialTasks = await getInitialTaskState();
			send('tasks:initial', { tasks: initialTasks });
		} catch (error) {
			// Log error but don't fail the connection - client will rely on server-rendered data
			console.error('[Tasks SSE] Failed to fetch initial task state:', error);
		}

		// --- Scheduled task event handlers ---

		const onTaskStarted = (taskType: string) => {
			const payload: TaskStartedEvent = {
				taskId: taskType,
				startedAt: new Date().toISOString()
			};
			send('task:started', payload);
		};

		const onTaskCompleted = async (taskType: string, result: TaskResult) => {
			const completionTime = new Date();
			const nextRunTime = await getNextRunTimeForTask(taskType, completionTime);
			const historyEntry = await getCompletedHistoryEntry(taskType);

			const payload: TaskCompletedEvent = {
				taskId: taskType,
				completedAt: completionTime.toISOString(),
				lastRunTime: completionTime.toISOString(),
				nextRunTime,
				result: {
					itemsProcessed: result.itemsProcessed,
					itemsGrabbed: result.itemsGrabbed,
					errors: result.errors
				},
				historyEntry
			};
			send('task:completed', payload);
		};

		const onTaskFailed = async (taskType: string, error: unknown) => {
			const completionTime = new Date();
			const historyEntry = await getFailedHistoryEntry(taskType, error);

			const payload: TaskFailedEvent = {
				taskId: taskType,
				completedAt: completionTime.toISOString(),
				error: error instanceof Error ? error.message : String(error),
				historyEntry
			};
			send('task:failed', payload);
		};

		const onTaskCancelled = (taskType: string) => {
			const payload: TaskCancelledEvent = {
				taskId: taskType,
				cancelledAt: new Date().toISOString()
			};
			send('task:cancelled', payload);
		};

		// --- Manual task event handlers ---

		const onManualTaskStarted = (taskType: string) => {
			const payload: TaskStartedEvent = {
				taskId: taskType,
				startedAt: new Date().toISOString()
			};
			send('task:started', payload);
		};

		const onManualTaskCompleted = async (taskType: string, result: TaskResult) => {
			const completionTime = new Date();
			const nextRunTime = await getNextRunTimeForTask(taskType, completionTime);
			const historyEntry = await getCompletedHistoryEntry(taskType);

			const payload: TaskCompletedEvent = {
				taskId: taskType,
				completedAt: completionTime.toISOString(),
				lastRunTime: completionTime.toISOString(),
				nextRunTime,
				result: {
					itemsProcessed: result.itemsProcessed,
					itemsGrabbed: result.itemsGrabbed,
					errors: result.errors
				},
				historyEntry
			};
			send('task:completed', payload);
		};

		const onManualTaskFailed = async (taskType: string, error: unknown) => {
			const completionTime = new Date();
			const historyEntry = await getFailedHistoryEntry(taskType, error);

			const payload: TaskFailedEvent = {
				taskId: taskType,
				completedAt: completionTime.toISOString(),
				error: error instanceof Error ? error.message : String(error),
				historyEntry
			};
			send('task:failed', payload);
		};

		const onManualTaskCancelled = (taskType: string) => {
			const payload: TaskCancelledEvent = {
				taskId: taskType,
				cancelledAt: new Date().toISOString()
			};
			send('task:cancelled', payload);
		};

		// --- Settings change event handler ---

		const onTaskSettingsUpdated = (data: {
			taskId: string;
			enabled?: boolean;
			intervalHours?: number;
			nextRunTime?: string | null;
		}) => {
			const payload: TaskUpdatedEvent = {
				taskId: data.taskId,
				enabled: data.enabled,
				intervalHours: data.intervalHours,
				nextRunTime: data.nextRunTime
			};
			send('task:updated', payload);
		};

		// Register all event handlers
		monitoringScheduler.on('taskStarted', onTaskStarted);
		monitoringScheduler.on('taskCompleted', onTaskCompleted);
		monitoringScheduler.on('taskFailed', onTaskFailed);
		monitoringScheduler.on('taskCancelled', onTaskCancelled);
		monitoringScheduler.on('manualTaskStarted', onManualTaskStarted);
		monitoringScheduler.on('manualTaskCompleted', onManualTaskCompleted);
		monitoringScheduler.on('manualTaskFailed', onManualTaskFailed);
		monitoringScheduler.on('manualTaskCancelled', onManualTaskCancelled);
		monitoringScheduler.on('taskSettingsUpdated', onTaskSettingsUpdated);

		// Return cleanup function
		return () => {
			monitoringScheduler.off('taskStarted', onTaskStarted);
			monitoringScheduler.off('taskCompleted', onTaskCompleted);
			monitoringScheduler.off('taskFailed', onTaskFailed);
			monitoringScheduler.off('taskCancelled', onTaskCancelled);
			monitoringScheduler.off('manualTaskStarted', onManualTaskStarted);
			monitoringScheduler.off('manualTaskCompleted', onManualTaskCompleted);
			monitoringScheduler.off('manualTaskFailed', onManualTaskFailed);
			monitoringScheduler.off('manualTaskCancelled', onManualTaskCancelled);
			monitoringScheduler.off('taskSettingsUpdated', onTaskSettingsUpdated);
		};
	});
};
