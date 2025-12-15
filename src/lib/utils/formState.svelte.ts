/**
 * Form state utility for modal forms with automatic sync on open/close.
 * Replaces the repeated $effect() pattern found across modal components.
 */

/**
 * Creates a reactive form state that syncs with source data when triggered.
 * Use this to manage modal form state that needs to reset when the modal opens.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   let { open, movie, onSave } = $props();
 *
 *   const form = createFormState({
 *     defaults: { title: '', year: 0, monitored: true },
 *     source: () => movie ? { title: movie.title, year: movie.year, monitored: movie.monitored } : null,
 *     trigger: () => open
 *   });
 *
 *   // Access state: form.state.title, form.state.year
 *   // Update state: form.state.title = 'New Title'
 *   // Reset to defaults: form.reset()
 *   // Get data for saving: form.getData()
 * </script>
 * ```
 */
export function createFormState<T extends Record<string, unknown>>(options: {
	defaults: T;
	source?: () => Partial<T> | null | undefined;
	trigger: () => boolean;
}): {
	state: T;
	reset: () => void;
	getData: () => T;
	isDirty: () => boolean;
} {
	const { defaults, source, trigger } = options;

	// Create reactive state initialized with defaults
	let state = $state<T>({ ...defaults });
	let initialState = $state<T>({ ...defaults });

	// Sync state when trigger changes to true
	$effect(() => {
		if (trigger()) {
			const sourceData = source?.() ?? null;
			if (sourceData) {
				// Merge source data with defaults
				const merged = { ...defaults, ...sourceData };
				Object.assign(state, merged);
				initialState = { ...merged };
			} else {
				// Reset to defaults
				Object.assign(state, defaults);
				initialState = { ...defaults };
			}
		}
	});

	return {
		get state() {
			return state;
		},
		reset() {
			Object.assign(state, defaults);
		},
		getData() {
			return { ...state };
		},
		isDirty() {
			return JSON.stringify(state) !== JSON.stringify(initialState);
		}
	};
}

/**
 * Creates a simple reactive form field state.
 * Useful for individual fields that need validation tracking.
 */
export function createField<T>(initialValue: T) {
	let value = $state<T>(initialValue);
	let touched = $state(false);
	let error = $state<string | null>(null);

	return {
		get value() {
			return value;
		},
		set value(v: T) {
			value = v;
		},
		get touched() {
			return touched;
		},
		get error() {
			return error;
		},
		touch() {
			touched = true;
		},
		setError(msg: string | null) {
			error = msg;
		},
		reset(newValue?: T) {
			value = newValue ?? initialValue;
			touched = false;
			error = null;
		},
		validate(validator: (v: T) => string | null) {
			error = validator(value);
			return error === null;
		}
	};
}
