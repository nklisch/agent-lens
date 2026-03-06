/**
 * Service configuration management.
 * Merges layered config objects and initializes services with the result.
 */

export interface BaseConfig {
	version: number;
	enabled: boolean;
}

export interface CacheConfig extends BaseConfig {
	ttlSeconds: number;
	maxEntries: number;
	strategy: "lru" | "fifo" | "lfu";
}

export interface RetryConfig extends BaseConfig {
	maxRetries: number;
	backoffMs: number;
	exponential: boolean;
}

export interface ServiceInit {
	config: BaseConfig;
	configVersion: string;
	features: string[];
}

/**
 * Merge a base config with an array of partial overrides.
 * Later overrides take precedence over earlier ones.
 * Fields set to `undefined` in an override are ignored.
 */
export function mergeConfigs<T extends BaseConfig>(base: T, overrides: Partial<T>[]): T {
	let result: T = { ...base };
	for (const override of overrides) {
		for (const key of Object.keys(override) as Array<keyof T>) {
			if (override[key] !== undefined) {
				result = { ...result, [key]: override[key] };
			}
		}
	}
	return result;
}

/**
 * Initialize a service with a merged configuration.
 * Returns metadata about the config version and enabled feature flags.
 */
export function initService<T extends BaseConfig>(base: T, overrides: Partial<T>[]): ServiceInit {
	const config = mergeConfigs(base, overrides);

	// Derive the version tag; an unset version produces "unknown".
	const configVersion = config.version ? `v${config.version}` : "unknown";

	const features: string[] = [];
	if (config.enabled) {
		features.push("core");
	}
	// Enable version-gated features based on config version.
	if (config.version >= 2) {
		features.push("advanced");
	}
	if (config.version >= 3) {
		features.push("experimental");
	}

	return { config, configVersion, features };
}
