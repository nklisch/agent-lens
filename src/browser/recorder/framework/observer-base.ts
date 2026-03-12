/**
 * Base class for framework state observers (React, Vue, and future Svelte/Solid).
 * Handles config merging; subclasses implement getInjectionScript().
 */
export class FrameworkObserver<TConfig extends object> {
	protected config: Required<TConfig>;

	constructor(defaults: Required<TConfig>, overrides: Partial<TConfig> = {}) {
		this.config = { ...defaults, ...overrides } as Required<TConfig>;
	}
}
