import { FrameworkObserver } from "./observer-base.js";
import { buildReactInjectionScript } from "./react-injection.js";

export interface ReactObserverConfig {
	/** Max framework events per second reported via __BL__. Default: 10. */
	maxEventsPerSecond?: number;
	/** Max depth for state/props serialization. Default: 3. */
	maxSerializationDepth?: number;
	/** Renders with unchanged deps before stale closure warning. Default: 5. */
	staleClosureThreshold?: number;
	/** Renders in 1s window before infinite loop warning. Default: 15. */
	infiniteRerenderThreshold?: number;
	/** Context consumers before excessive re-render warning. Default: 20. */
	contextRerenderThreshold?: number;
	/** Max fibers visited per commit (safety cap). Default: 5000. */
	maxFibersPerCommit?: number;
	/** Max queued events before overflow (oldest dropped). Default: 1000. */
	maxQueueSize?: number;
}

const REACT_OBSERVER_DEFAULTS: Required<ReactObserverConfig> = {
	maxEventsPerSecond: 10,
	maxSerializationDepth: 3,
	staleClosureThreshold: 5,
	infiniteRerenderThreshold: 15,
	contextRerenderThreshold: 20,
	maxFibersPerCommit: 5000,
	maxQueueSize: 1000,
};

/**
 * Manages the React state observation injection script.
 * Instantiated by FrameworkTracker when "react" is in the enabled frameworks.
 */
export class ReactObserver extends FrameworkObserver<ReactObserverConfig> {
	constructor(config: ReactObserverConfig = {}) {
		super(REACT_OBSERVER_DEFAULTS, config);
	}

	/**
	 * Returns the injection script IIFE string.
	 * This script patches __REACT_DEVTOOLS_GLOBAL_HOOK__ (installed by detector.ts)
	 * to observe fiber commits and report state changes via __BL__.
	 */
	getInjectionScript(): string {
		return buildReactInjectionScript(this.config);
	}
}
