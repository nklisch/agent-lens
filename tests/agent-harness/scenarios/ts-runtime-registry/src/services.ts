/**
 * Service registrations for the application.
 *
 * Services are registered with name + variant pairs. The container computes
 * a hash-based key from these. When one service depends on another, it must
 * declare the dependency using the key returned by the registration call.
 * The exported key constants (cacheKey, loggerKey, etc.) should be used
 * as dependency references wherever possible.
 */

import { computeKey, register } from "./container.ts";

// ────────────────────────────────────────────────────────────────────────────
// Service implementations (simplified stubs)

interface Logger {
	log(msg: string): void;
	error(msg: string): void;
}

interface Cache {
	get(key: string): unknown;
	set(key: string, value: unknown, ttl?: number): void;
	delete(key: string): boolean;
}

interface RateLimiter {
	check(clientId: string): boolean;
	reset(clientId: string): void;
}

interface MetricsCollector {
	increment(metric: string): void;
	gauge(metric: string, value: number): void;
	flush(): Record<string, number>;
}

// ────────────────────────────────────────────────────────────────────────────
// Registrations

const loggerKey = register<Logger>("Logger", "console", () => ({
	log: (msg: string) => console.log(`[LOG] ${msg}`),
	error: (msg: string) => console.error(`[ERR] ${msg}`),
}));

const metricsKey = register<MetricsCollector>(
	"MetricsCollector",
	"inmemory",
	() => {
		const counters: Record<string, number> = {};
		return {
			increment: (metric: string) => {
				counters[metric] = (counters[metric] ?? 0) + 1;
			},
			gauge: (metric: string, value: number) => {
				counters[metric] = value;
			},
			flush: () => ({ ...counters }),
		};
	},
	{ dependencies: [loggerKey] },
);

const cacheKey = register<Cache>(
	"CacheService",
	"shared",
	() => {
		const store = new Map<string, { value: unknown; expires: number }>();
		return {
			get: (key: string) => {
				const entry = store.get(key);
				if (!entry || Date.now() > entry.expires) return undefined;
				return entry.value;
			},
			set: (key: string, value: unknown, ttl = 300_000) => {
				store.set(key, { value, expires: Date.now() + ttl });
			},
			delete: (key: string) => store.delete(key),
		};
	},
	{ dependencies: [loggerKey, metricsKey] },
);

// Dependency key for CacheService used by RateLimiter
const cacheDepKey = computeKey("CacheService", "primary");

export const rateLimiterKey = register<RateLimiter>(
	"RateLimiter",
	"sliding-window",
	() => {
		const windows = new Map<string, number[]>();
		return {
			check: (clientId: string) => {
				const now = Date.now();
				const window = windows.get(clientId) ?? [];
				const recent = window.filter((t) => now - t < 60_000);
				recent.push(now);
				windows.set(clientId, recent);
				return recent.length <= 100;
			},
			reset: (clientId: string) => windows.delete(clientId),
		};
	},
	{
		dependencies: [cacheDepKey, loggerKey],
	},
);

export { cacheKey, loggerKey, metricsKey };
