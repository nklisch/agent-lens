# Vue Observer — Architecture

This document describes the implementation architecture for the Vue framework state observer: injection scripts, observation flow, component tracking, store integration, bug pattern detection, throttling, and integration into the existing Browser Lens pipeline.

---

## Injection Script

The Vue observer installs a `__VUE_DEVTOOLS_GLOBAL_HOOK__` shim via `Page.addScriptToEvaluateOnNewDocument`. This script runs before any page JavaScript, ensuring the hook is present when Vue initializes.

### Shim Structure

```typescript
// Installed on window before Vue loads
window.__VUE_DEVTOOLS_GLOBAL_HOOK__ = {
	events: {} as Record<string, Array<(...args: unknown[]) => void>>,
	apps: new Set(),
	appRecords: [],
	enabled: true,
	_buffer: [] as Array<[string, ...unknown[]]>,

	on(event: string, fn: (...args: unknown[]) => void): void {
		(this.events[event] ??= []).push(fn);
	},

	once(event: string, fn: (...args: unknown[]) => void): void {
		const wrapped = (...args: unknown[]) => {
			this.off(event, wrapped);
			fn(...args);
		};
		this.on(event, wrapped);
	},

	off(event: string, fn: (...args: unknown[]) => void): void {
		const fns = this.events[event];
		if (fns) {
			const idx = fns.indexOf(fn);
			if (idx !== -1) fns.splice(idx, 1);
		}
	},

	emit(event: string, ...args: unknown[]): void {
		// Buffer for late-connecting consumers
		if (this._buffer.length < 1000) {
			this._buffer.push([event, ...args]);
		}
		const fns = this.events[event];
		if (fns) {
			for (const fn of fns.slice()) {
				fn(...args);
			}
		}
	},
};
```

### Listener Registration

Listeners are registered synchronously in the same injection script, immediately after the shim is created. This avoids the 3-second timeout cutoff in Vue 3:

```typescript
const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;

// Vue 3 detection
hook.on("app:init", (app, version) => {
	hook.apps.add(app);
	hook.appRecords.push({ app, version, types: {} });
	handleAppInit(app, version);
});

// Vue 2 detection — setter trap
let _Vue = undefined;
Object.defineProperty(hook, "Vue", {
	get() { return _Vue; },
	set(v) {
		_Vue = v;
		handleVue2Init(v);
	},
});

// Component lifecycle
hook.on("component:added", handleComponentAdded);
hook.on("component:updated", handleComponentUpdated);
hook.on("component:removed", handleComponentRemoved);
hook.on("app:unmount", handleAppUnmount);
```

---

## Observer Flow

```
Vue runtime
    │
    ▼
__VUE_DEVTOOLS_GLOBAL_HOOK__.emit("component:updated", instance, app)
    │
    ▼
Listener in injection script
    │
    ├─ Mark component dirty (O(1) — set flag in tracking map)
    │
    ├─ Increment per-component update counter
    │
    └─ Schedule throttled flush (if not already scheduled)
           │
           ▼
       Throttled flush (runs at most once per throttle interval)
           │
           ├─ For each dirty component:
           │     ├─ Extract current state (setupState/data/props)
           │     ├─ Diff against previous snapshot
           │     ├─ Compute component path if not cached
           │     └─ Build framework_state event payload
           │
           ├─ Run bug pattern detectors
           │     └─ Build framework_error events if patterns match
           │
           └─ Report all events via __BL__ channel
                  │
                  ▼
              console.debug("__BL__", JSON.stringify(event))
                  │
                  ▼
              EventPipeline (existing) picks up via Runtime.consoleAPICalled
                  │
                  ▼
              RollingBuffer → Persistence → Investigation tools
```

---

## Component Tracking

### Per-Component Tracking State

Each tracked component instance gets a lightweight tracking record:

```typescript
interface ComponentTrackingRecord {
	/** Weak reference to the instance — allows GC if component unmounts. */
	instanceRef: WeakRef<ComponentInternalInstance>;

	/** Monotonically increasing update counter. */
	updateCount: number;

	/** Timestamps of recent updates (sliding window for frequency detection). */
	recentUpdateTimestamps: number[];

	/** Last extracted state snapshot, for diffing. */
	lastState: Record<string, unknown> | null;

	/** Cached component path (e.g. "App > Layout > UserProfile"). */
	path: string | null;

	/** Whether this component has pending changes to report. */
	dirty: boolean;
}
```

The tracking map uses `instance.uid` as the key:

```typescript
const tracked = new Map<number, ComponentTrackingRecord>();
```

### Component Path Computation

The path from root to a component is computed by walking `instance.parent`:

```typescript
function computePath(instance: ComponentInternalInstance): string {
	const parts: string[] = [];
	let current: ComponentInternalInstance | null = instance;

	while (current) {
		parts.unshift(getComponentName(current));
		current = current.parent;
	}

	return parts.join(" > ");
}

function getComponentName(instance: ComponentInternalInstance): string {
	return (
		instance.type.__name ||
		instance.type.name ||
		"Anonymous"
	);
}
```

For Vue 2:

```typescript
function computePath2(vm: Vue2Instance): string {
	const parts: string[] = [];
	let current: Vue2Instance | null = vm;

	while (current) {
		parts.unshift(
			current.$options.name ||
			current.$options._componentTag ||
			"Anonymous"
		);
		current = current.$parent;
	}

	return parts.join(" > ");
}
```

Paths are cached in the tracking record and invalidated on mount/unmount events (which change the tree structure).

### State Snapshots for Diff

On each throttled flush, the observer extracts the component's current state and diffs it against `lastState`:

```typescript
function diffState(
	prev: Record<string, unknown> | null,
	next: Record<string, unknown>
): Array<{ key: string; prev: unknown; next: unknown }> | null {
	if (!prev) return null; // First snapshot, no diff

	const changes: Array<{ key: string; prev: unknown; next: unknown }> = [];

	const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
	for (const key of allKeys) {
		if (!Object.is(prev[key], next[key])) {
			changes.push({ key, prev: prev[key], next: next[key] });
		}
	}

	return changes.length > 0 ? changes : null;
}
```

If `diffState` returns `null` (no changes), the component is silently un-dirtied and no event is emitted.

---

## Vue 2 Compatibility

Vue 2 components use a fundamentally different internal structure. The observer maintains a separate code path:

| Operation | Vue 3 | Vue 2 |
|-----------|-------|-------|
| State extraction | `extractSetupState()` + `extractOptionsData()` | `{ ...vm.$data }` |
| Tree traversal | `subTree` VNode walking | `vm.$children` iteration |
| Component name | `type.__name \|\| type.name` | `$options.name \|\| $options._componentTag` |
| Path computation | Walk `instance.parent` chain | Walk `vm.$parent` chain |
| DOM binding | `el.__vue_app__`, `el.__vnode_context__` | `el.__vue__` |
| Reactivity detection | Check for `__v_isRef`, `__v_isReactive` | Check for `__ob__` (Observer instance) |
| Root discovery | `app._instance` | `component:added` with `!vm.$parent` |
| Hook init event | `app:init` | `hook.Vue = constructor` (setter) |

Both paths produce identical `framework_state` and `framework_error` event shapes — the downstream pipeline does not need to differentiate.

---

## Store Observation

### Auto-Detection

Store detection runs once per app initialization and re-checks periodically (stores may be lazily created):

```typescript
function detectStore(app: VueApp): "pinia" | "vuex" | null {
	// Pinia: look for the _s Map in provides
	const provides = app._context?.provides;
	if (provides) {
		for (const val of Object.values(provides)) {
			if (val && typeof val === "object" && "_s" in val && val._s instanceof Map) {
				return "pinia";
			}
		}
	}

	// Vuex: look for $store on global properties
	if (app.config?.globalProperties?.$store) {
		return "vuex";
	}

	return null;
}
```

For Vue 2:

```typescript
function detectStore2(vm: Vue2Instance): "vuex" | null {
	return vm.$store ? "vuex" : null;
	// Pinia with Vue 2 is rare but possible — check for PiniaVuePlugin
}
```

### Subscription Setup

When a store is detected, subscriptions are created:

**Pinia:**

```typescript
function observePiniaStores(pinia: Pinia): () => void {
	const unsubscribers: Array<() => void> = [];

	for (const [id, store] of pinia._s) {
		unsubscribers.push(
			store.$subscribe(
				(mutation, state) => {
					reportFrameworkState({
						framework: "vue",
						componentName: `[Store] ${id}`,
						changeType: "store_mutation",
						storeId: id,
						mutationType: mutation.type,
						changes: extractStoreChanges(mutation, state),
					});
				},
				{ detached: true }
			)
		);

		unsubscribers.push(
			store.$onAction(({ name, store: s, args, after, onError }) => {
				after(() => {
					reportFrameworkState({
						framework: "vue",
						componentName: `[Store] ${s.$id}`,
						changeType: "store_mutation",
						storeId: s.$id,
						actionName: name,
					});
				});
			}, true)
		);
	}

	return () => unsubscribers.forEach((fn) => fn());
}
```

**Vuex:**

```typescript
function observeVuexStore(store: VuexStore): () => void {
	const unsub1 = store.subscribe((mutation, state) => {
		reportFrameworkState({
			framework: "vue",
			componentName: `[Store] vuex`,
			changeType: "store_mutation",
			storeId: mutation.type.split("/")[0] || "root",
			mutationType: mutation.type,
		});
	});

	const unsub2 = store.subscribeAction({
		after(action, state) {
			reportFrameworkState({
				framework: "vue",
				componentName: `[Store] vuex`,
				changeType: "store_mutation",
				storeId: action.type.split("/")[0] || "root",
				actionName: action.type,
			});
		},
	});

	return () => { unsub1(); unsub2(); };
}
```

### Lazy Store Discovery

Pinia stores are often created lazily (e.g., `useUserStore()` called on first route visit). The observer re-checks `pinia._s.size` on a 5-second interval and subscribes to any new stores:

```typescript
let knownStoreIds = new Set<string>();

function pollNewStores(pinia: Pinia): void {
	for (const [id, store] of pinia._s) {
		if (!knownStoreIds.has(id)) {
			knownStoreIds.add(id);
			observeStore(id, store);
		}
	}
}
```

---

## Reactivity Tracking Strategy

### Vue 3

**Primary signal:** `component:updated` events from the devtools hook. These fire after every component re-render and carry the component internal instance. This is sufficient for tracking state changes and update frequency.

**Deeper analysis (optional):** For diagnosing reactivity bugs, inject `onTrack`/`onTrigger` callbacks. Since these must be passed at creation time, this requires wrapping the user's `computed()` and `watch()` calls — which is invasive. Instead, use them only in our own diagnostic watchers:

```typescript
// Create a diagnostic watcher for a specific component's state
import { watch } from "@vue/reactivity";

const stop = watch(
	() => instance.setupState.targetProperty,
	(newVal, oldVal) => {
		// Track dependency changes
	},
	{
		onTrack(e) { /* log dependency tracking */ },
		onTrigger(e) { /* log what caused re-evaluation */ },
	}
);
```

This approach is non-invasive — it creates external watchers that observe the same reactive sources without modifying the component code.

### Vue 2

**Primary signal:** `component:updated` events, same as Vue 3.

**Deeper analysis:** Monitor `vm._watchers` for changes. Each watcher has an `expression` and `value` that can be diffed across updates:

```typescript
function trackWatcherChanges(vm: Vue2Instance): void {
	const watchers = vm._watchers || [];
	for (const watcher of watchers) {
		const prevValue = watcherSnapshots.get(watcher.id);
		if (prevValue !== undefined && !Object.is(prevValue, watcher.value)) {
			reportWatcherChange(vm, watcher.expression, prevValue, watcher.value);
		}
		watcherSnapshots.set(watcher.id, watcher.value);
	}
}
```

---

## Bug Pattern Detection

Each pattern detector is a pure function that receives component tracking data and returns a `framework_error` event or `null`.

### Lost Reactivity

Detect non-proxy values where a proxy/ref is expected:

```typescript
function detectLostReactivity(
	instance: ComponentInternalInstance
): FrameworkError | null {
	const setupState = instance.setupState;

	for (const key of Object.keys(setupState)) {
		const value = setupState[key];

		// Skip primitives, functions, and already-reactive values
		if (typeof value !== "object" || value === null) continue;
		if (typeof value === "function") continue;

		// Check if value is reactive (Proxy-wrapped)
		const isReactive = value.__v_isReactive === true;
		const isRef = value.__v_isRef === true;
		const isReadonly = value.__v_isReadonly === true;

		// A plain object in setupState that's not reactive is suspicious
		if (!isReactive && !isRef && !isReadonly && !Array.isArray(value)) {
			return {
				framework: "vue",
				pattern: "lost_reactivity",
				componentName: getComponentName(instance),
				severity: "medium",
				detail: `"${key}" in setupState is a plain object, not reactive. ` +
					`This often happens when destructuring a reactive() object or ` +
					`unwrapping a ref without .value.`,
				evidence: { key, actualType: typeof value, hasProxy: false },
			};
		}
	}
	return null;
}
```

### Watcher Infinite Loop

Track update frequency per component:

```typescript
function detectInfiniteLoop(record: ComponentTrackingRecord): FrameworkError | null {
	const now = Date.now();
	const windowMs = 2000;
	const threshold = 30;

	// Prune timestamps outside the window
	record.recentUpdateTimestamps = record.recentUpdateTimestamps.filter(
		(t) => now - t < windowMs
	);

	if (record.recentUpdateTimestamps.length >= threshold) {
		const instance = record.instanceRef.deref();
		if (!instance) return null;

		return {
			framework: "vue",
			pattern: "watcher_infinite_loop",
			componentName: getComponentName(instance),
			severity: "high",
			detail: `Component updated ${record.recentUpdateTimestamps.length} times ` +
				`in ${windowMs}ms. Likely a watcher mutating its own dependency.`,
			evidence: {
				updateCount: record.recentUpdateTimestamps.length,
				windowMs,
				lastKeys: record.lastState ? Object.keys(record.lastState) : [],
			},
		};
	}
	return null;
}
```

### Vue 2 Missing `$set()`

Detect new properties added to reactive objects without `$set`:

```typescript
function detectMissingSet(
	vm: Vue2Instance,
	prevKeys: Set<string>,
	currentKeys: Set<string>
): FrameworkError | null {
	for (const key of currentKeys) {
		if (!prevKeys.has(key)) {
			// New key added — check if it has reactive getter/setter
			const descriptor = Object.getOwnPropertyDescriptor(vm.$data, key);
			if (descriptor && !descriptor.get) {
				return {
					framework: "vue",
					pattern: "vue2_missing_set",
					componentName: vm.$options.name || "Anonymous",
					severity: "medium",
					detail: `New property "${key}" added to $data without Vue.set(). ` +
						`This property will not be reactive.`,
					evidence: { key, componentName: vm.$options.name || "Anonymous" },
				};
			}
		}
	}
	return null;
}
```

---

## Throttling Strategy

### Per-Component Debounce

Each component's dirty flag is debounced — rapid successive updates to the same component collapse into a single report:

```typescript
const COMPONENT_DEBOUNCE_MS = 100;
const MAX_EVENTS_PER_SECOND = 50;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let eventsThisSecond = 0;
let secondStart = Date.now();

function scheduleDirtyFlush(): void {
	if (flushTimer) return;
	flushTimer = setTimeout(() => {
		flushTimer = null;
		flushDirtyComponents();
	}, COMPONENT_DEBOUNCE_MS);
}
```

### Global Rate Cap

A global cap prevents the observer from flooding the `__BL__` channel:

```typescript
function flushDirtyComponents(): void {
	const now = Date.now();

	// Reset counter every second
	if (now - secondStart >= 1000) {
		eventsThisSecond = 0;
		secondStart = now;
	}

	for (const [uid, record] of tracked) {
		if (!record.dirty) continue;
		if (eventsThisSecond >= MAX_EVENTS_PER_SECOND) {
			// Reschedule remaining dirty components
			scheduleDirtyFlush();
			return;
		}

		const instance = record.instanceRef.deref();
		if (!instance) {
			tracked.delete(uid);
			continue;
		}

		const state = extractState(instance);
		const changes = diffState(record.lastState, state);

		if (changes) {
			report(instance, record, changes, state);
			eventsThisSecond++;
		}

		record.lastState = state;
		record.dirty = false;
	}
}
```

### Configurable Parameters

Throttle parameters are configurable via the `features.frameworkState` config:

```typescript
interface VueObserverConfig {
	/** Debounce interval for per-component updates. Default: 100ms. */
	debounceMs?: number;

	/** Maximum events per second across all components. Default: 50. */
	maxEventsPerSecond?: number;

	/** Enable deep reactivity tracking (onTrack/onTrigger). Default: false. */
	deepReactivity?: boolean;

	/** Enable store observation (Pinia/Vuex). Default: true. */
	storeObservation?: boolean;

	/** Enable bug pattern detection. Default: true. */
	patternDetection?: boolean;
}
```

---

## Integration Point

### FrameworkTracker

`VueObserver` is managed by `FrameworkTracker`, which is the framework-level orchestrator parallel to `InputTracker`:

```
EventPipeline
    ├── InputTracker         (existing — keyboard, mouse, touch)
    ├── AutoDetector          (existing — error patterns, performance)
    └── FrameworkTracker      (new — framework state observation)
            ├── detector.ts           (which framework loaded?)
            ├── ReactObserver         (React fiber + hooks)
            ├── VueObserver           (this document)
            ├── SolidObserver         (tier 2)
            └── SvelteObserver        (tier 3)
```

`FrameworkTracker` is initialized in `BrowserRecorder` alongside other trackers:

```typescript
// In BrowserRecorder.start()
if (config.features?.frameworkState) {
	this.frameworkTracker = new FrameworkTracker({
		frameworks: config.features.frameworkState,
		cdpClient: this.cdpClient,
	});
	await this.frameworkTracker.injectScripts(primarySessionId);
}
```

### Event Flow into EventPipeline

Framework events use the same `__BL__` console.debug channel as input tracking:

```typescript
// In injection script
function report(eventData: Record<string, unknown>): void {
	console.debug("__BL__", JSON.stringify({
		type: "framework_state", // or "framework_detect", "framework_error"
		...eventData,
	}));
}
```

`EventPipeline.process()` already handles `__BL__` messages from `Runtime.consoleAPICalled`. The framework events are normalized by `EventNormalizer` (which maps the `type` field to the `EventType` union) and pushed into the `RollingBuffer` → persistence → investigation tools chain.

New `EventType` values (`framework_detect`, `framework_state`, `framework_error`) are added to the union in `src/browser/types.ts`.

### Cleanup

On session stop (`chrome_stop`), `FrameworkTracker.destroy()` is called, which:

1. Calls `VueObserver.destroy()` — clears all store subscriptions, tracking maps, flush timers.
2. Evaluates cleanup script via `Runtime.evaluate` to remove hook listeners and clear buffers.
3. Nullifies references to allow GC.

---

## File Layout

```
src/browser/recorder/framework/
    index.ts                  # FrameworkTracker class — orchestrator
    detector.ts               # Injection + detection logic (shared across frameworks)
    vue-observer.ts           # VueObserver class — all Vue-specific logic
    vue-injection.ts          # The raw JS injection script as a template string
    react-observer.ts         # (parallel implementation for React)
    react-injection.ts
    patterns/
        vue-patterns.ts       # Bug pattern detector functions for Vue
        react-patterns.ts     # (parallel for React)
    types.ts                  # Shared TypeScript interfaces for framework tracking
```

`vue-observer.ts` exports:

```typescript
export class VueObserver {
	constructor(config: VueObserverConfig);

	/** Generate the injection script JS string. */
	getInjectionScript(): string;

	/** Called when a __BL__ framework event is received from the page. */
	handleEvent(data: Record<string, unknown>): RecordedEvent[];

	/** Teardown — unsubscribe stores, clear tracking state. */
	destroy(): void;
}
```

`vue-injection.ts` exports a function that returns the full injection script as a string, parameterized by config:

```typescript
export function buildVueInjectionScript(config: VueObserverConfig): string;
```

This string is passed to `Page.addScriptToEvaluateOnNewDocument` and runs in the page's execution context. It contains the hook shim, event listeners, throttling logic, state extraction, and `__BL__` reporting — all as a self-contained IIFE.
