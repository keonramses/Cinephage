/**
 * Smart List Refresh Task
 *
 * Automated task for refreshing smart lists that are due.
 * Runs hourly to check which lists need to be refreshed based on their individual intervals.
 */

import { getSmartListService } from '$lib/server/smartlists/index.js';
import { logger } from '$lib/logging';
import type { TaskResult } from '../MonitoringScheduler.js';

export async function executeSmartListRefreshTask(taskHistoryId?: string): Promise<TaskResult> {
	logger.info('[SmartListRefreshTask] Starting smart list refresh task');

	const service = getSmartListService();

	try {
		const results = await service.refreshAllDueLists();

		const itemsProcessed = results.length;
		const itemsGrabbed = results.reduce((sum, r) => sum + r.itemsAutoAdded, 0);
		const errors = results.filter((r) => r.status === 'failed').length;

		logger.info('[SmartListRefreshTask] Completed', {
			listsRefreshed: itemsProcessed,
			itemsAutoAdded: itemsGrabbed,
			errors
		});

		return {
			taskType: 'smartListRefresh',
			itemsProcessed,
			itemsGrabbed,
			errors,
			executedAt: new Date()
		};
	} catch (error) {
		logger.error('[SmartListRefreshTask] Failed', error);
		throw error;
	}
}
