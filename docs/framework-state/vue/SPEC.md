# Vue Observer — Specification

This document defines the formal contracts, detection criteria, event schemas, and bug pattern definitions for the Vue framework state observer. It is the authoritative reference for implementing `vue-observer.ts`.

---

## Detection Criteria

Vue is detected through the `__VUE_DEVTOOLS_GLOBAL_HOOK__` shim installed by our injection script. Detection differs between Vue 2 and Vue 3:

**Vue 3:** The framework calls `hook.emit('app:init', app, version, ...)` during `createApp().mount()`. The observer receives this event and extracts:

- `app.version` — semver string (e.g. `"3.4.21"`)
- `app._instance` — the root component internal instance
- `app._context` — the application context (provides, global components, directives)

**Vue 2:** The framework sets `hook.Vue = VueConstructor` during initialization. The observer detects this via a setter trap on the hook object and extracts:

- `hook.Vue.version` — semver string (e.g. `"2.7.16"`)
- Root instances are discovered by watching for `component:added` events with no `parent`

**Version extraction:**

```typescript
// Vue 3
const version = app.version; // "3.4.21"

// Vue 2
const version = hook.Vue.version; // "2.7.16"
```

A `framework_detect` event is emitted once detection completes.

---

## Hook Contract

The `__VUE_DEVTOOLS_GLOBAL_HOOK__` object must conform to this shape when installed by the injection script:

```typescript
interface VueDevtoolsGlobalHook {
	/** Event emitter — maps event names to arrays of listener functions. */
	on(event: string, fn: (...args: unknown[]) => void): void;
	once(event: string, fn: (...args: unknown[]) => void): void;
	off(event: string, fn: (...args: unknown[]) => void): void;
	emit(event: string, ...args: unknown[]): void;

	/** Set of mounted Vue 3 app instances. Populated by app:init events. */
	apps: Set<VueApp>;

	/** Array of app records with metadata. Vue devtools compat. */
	appRecords: Array<{
		app: VueApp;
		version: string;
		types: Record<string, unknown>;
	}>;

	/** Whether devtools integration is active. Must be true for Vue to emit events. */
	enabled: boolean;

	/** Vue 2 sets this to the Vue constructor. Absent in Vue 3. */
	Vue?: VueConstructor;

	/** Event buffer — stores events emitted before any listener is registered. */
	_buffer: Array<[string, ...unknown[]]>;

	/** Cleanup callbacks for teardown. */
	cleanupBuffer?: (fn: (...args: unknown[]) => void) => void;
}
```

**Key behavior:** Vue checks for the hook's existence synchronously during module evaluation. The hook must be present on `window` before any Vue code executes. Events emitted before listeners are registered are stored in `_buffer` and replayed when a listener first calls `on()`.

---

## Event Data Schemas

These extend the base `RecordedEvent.data` shapes defined in [APPROACH.md](../APPROACH.md) with Vue-specific fields.

### `framework_detect`

```typescript
{
	framework: "vue",
	version: string,                    // e.g. "3.4.21" or "2.7.16"
	rootCount: number,                  // number of mounted app instances
	componentCount: number,             // total components in all trees
	storeDetected?: "pinia" | "vuex",   // if a store library is detected
}
```

### `framework_state`

```typescript
{
	framework: "vue",
	componentName: string,              // e.g. "UserProfile"
	componentPath?: string,             // e.g. "App > Layout > UserProfile"
	changeType: "mount" | "update" | "unmount" | "store_mutation",
	changes?: Array<{
		key: string,
		prev: unknown,
		next: unknown,
	}>,
	renderCount?: number,               // cumulative updates for this component
	triggerSource?: string,             // "prop" | "state" | "store" | "inject" | "force"

	// Vue-specific extensions:
	storeId?: string,                   // Pinia store $id or Vuex module path
	mutationType?: string,              // Pinia: "direct" | "patch object" | "patch function"
	actionName?: string,                // if triggered by a store action
}
```

### `framework_error`

```typescript
{
	framework: "vue",
	pattern: string,                    // see Bug Pattern Definitions below
	componentName: string,
	severity: "low" | "medium" | "high",
	detail: string,                     // human-readable explanation
	evidence: Record<string, unknown>,  // pattern-specific diagnostic data
}
```

---

## Component Instance Contract

The observer interacts with Vue's internal component instance. The relevant properties differ between Vue 2 and Vue 3.

### Vue 3 — `ComponentInternalInstance`

```typescript
interface ComponentInternalInstance {
	/** Component definition object. */
	type: {
		name?: string;
		__name?: string;           // SFC compiler-generated name
		__file?: string;           // SFC source file path
		setup?: Function;
		render?: Function;
		props?: Record<string, unknown>;
		emits?: string[] | Record<string, unknown>;
	};

	/** The rendered VNode subtree (current render output). */
	subTree: VNode;

	/** The VNode representing this component in the parent's tree. */
	vnode: VNode;

	/** Parent component instance, or null for root. */
	parent: ComponentInternalInstance | null;

	/** The public proxy (what template/render fn sees as `this`). */
	proxy: Record<string, unknown> | null;

	/**
	 * Reactive state from setup(). Values are auto-unwrapped refs
	 * (proxyRefs), so `setupState.count` gives the raw value, not a Ref.
	 */
	setupState: Record<string, unknown>;

	/** Options API data() return value, wrapped in reactive(). */
	data: Record<string, unknown>;

	/** Resolved props. Reactive, shallow-readonly in dev mode. */
	props: Record<string, unknown>;

	/** Provided values from this component and ancestors. */
	provides: Record<string | symbol, unknown>;

	/** Template refs. */
	refs: Record<string, unknown>;

	/** Slots object. */
	slots: Record<string, Function>;

	/** App-level context (global provides, components, directives). */
	appContext: {
		app: VueApp;
		config: Record<string, unknown>;
		provides: Record<string | symbol, unknown>;
	};

	/** Unique instance ID (monotonically increasing). */
	uid: number;

	/** Whether the component is unmounted. */
	isUnmounted: boolean;
}
```

### Vue 2 — Component Instance (`vm`)

```typescript
interface Vue2Instance {
	/** Constructor options. */
	$options: {
		name?: string;
		_componentTag?: string;
		__file?: string;
		props?: Record<string, unknown>;
	};

	/** Reactive data. */
	$data: Record<string, unknown>;

	/** Resolved props. */
	$props: Record<string, unknown>;

	/** Parent instance. */
	$parent: Vue2Instance | null;

	/** Direct child instances. */
	$children: Vue2Instance[];

	/** Root instance of the component tree. */
	$root: Vue2Instance;

	/** Template refs. */
	$refs: Record<string, unknown>;

	/** Mounted DOM element. */
	$el: Element;

	/** Provided values. */
	_provided: Record<string, unknown>;

	/** Active watchers. */
	_watchers: Watcher[];

	/** Computed property watchers. */
	_computedWatchers: Record<string, Watcher>;

	/** Unique ID. */
	_uid: number;

	/** Whether destroyed. */
	_isDestroyed: boolean;
}
```

---

## Vue 2 vs Vue 3 Differences

| Concern | Vue 3 | Vue 2 |
|---------|-------|-------|
| **Tree traversal** | `instance.subTree` VNode tree → `vnode.component` for child instances | `vm.$children` array, `vm.$parent` |
| **State access** | `setupState` (Composition API) + `data` (Options API) | `$data` only |
| **Reactivity system** | ES Proxy-based (`reactive()`, `ref()`) | `Object.defineProperty` getter/setter |
| **DOM binding** | `element.__vue_app__` (app), `element.__vnode_context__` | `element.__vue__` (component instance) |
| **Component name** | `type.name` or `type.__name` (SFC) | `$options.name` or `$options._componentTag` |
| **Devtools hook event** | `app:init` with app instance | Sets `hook.Vue` to constructor |
| **Provide/inject** | `instance.provides` object | `vm._provided` |
| **Computed debugging** | Via `computed()` options: `onTrack`, `onTrigger` | `vm._computedWatchers[key]` |
| **Root discovery** | `app._instance` | `hook.Vue` constructor + `component:added` with no parent |

---

## DevtoolsHooks Enum

Vue 3 defines these hook event names. Our observer listens for them on the global hook:

```typescript
const enum DevtoolsHooks {
	APP_INIT = "app:init",
	APP_UNMOUNT = "app:unmount",
	COMPONENT_ADDED = "component:added",
	COMPONENT_UPDATED = "component:updated",
	COMPONENT_REMOVED = "component:removed",
	COMPONENT_EMIT = "component:emit",
	PERFORMANCE_START = "perf:start",
	PERFORMANCE_END = "perf:end",
}
```

**Event signatures:**

| Event | Arguments | Notes |
|-------|-----------|-------|
| `app:init` | `(app, version, env)` | Fired once per `createApp().mount()` |
| `app:unmount` | `(app)` | Fired when `app.unmount()` is called |
| `component:added` | `(instance, appInstance)` | After mount lifecycle |
| `component:updated` | `(instance, appInstance)` | After patch/re-render |
| `component:removed` | `(instance, appInstance)` | After unmount lifecycle |
| `component:emit` | `(instance, event, args)` | When `$emit()` is called |
| `perf:start` | `(instance, type, time)` | Dev-mode render/patch timing |
| `perf:end` | `(instance, type, time)` | Dev-mode render/patch timing |

Vue 2 uses the same event names for `component:added`, `component:updated`, and `component:removed`, but passes the Vue 2 instance directly (not an internal instance).

---

## Store Integration

### Pinia

Pinia stores are detected via the app's provides map or `getActivePinia()` on the window.

```typescript
interface PiniaStore {
	/** Store identifier. */
	$id: string;

	/** Reactive state. */
	$state: Record<string, unknown>;

	/**
	 * Subscribe to state mutations.
	 * mutation.type: "direct" | "patch object" | "patch function"
	 * mutation.storeId: string
	 * mutation.events: DebuggerEvent | DebuggerEvent[]
	 */
	$subscribe(
		callback: (mutation: PiniaMutation, state: Record<string, unknown>) => void,
		options?: { detached?: boolean }
	): () => void;

	/**
	 * Subscribe to actions. Called before and after each action.
	 */
	$onAction(
		callback: (context: {
			name: string;
			store: PiniaStore;
			args: unknown[];
			after: (cb: (result: unknown) => void) => void;
			onError: (cb: (error: Error) => void) => void;
		}) => void,
		detached?: boolean
	): () => void;
}

/** Pinia root. _s is the internal Map<string, PiniaStore>. */
interface Pinia {
	_s: Map<string, PiniaStore>;
	state: Record<string, Record<string, unknown>>;
}
```

### Vuex

Vuex stores are detected via `app.config.globalProperties.$store` (Vue 3) or `vm.$store` (Vue 2).

```typescript
interface VuexStore {
	state: Record<string, unknown>;
	getters: Record<string, unknown>;

	/** Subscribe to mutations. */
	subscribe(
		fn: (mutation: { type: string; payload: unknown }, state: Record<string, unknown>) => void
	): () => void;

	/** Subscribe to actions. */
	subscribeAction(
		fn: (action: { type: string; payload: unknown }, state: Record<string, unknown>) => void,
		options?: { prepend?: boolean }
	): () => void;
}
```

---

## Bug Pattern Definitions

Each pattern has a unique identifier, detection heuristic, and severity.

### `lost_reactivity`

**Severity:** medium
**Description:** A reactive value has been destructured from a reactive object or a `ref()` was unwrapped outside a template, breaking the reactivity link.
**Detection:** During state extraction, check for plain values in positions where a `Ref` or `Proxy` is expected. Specifically: if a setup() return value is a plain object (no `__v_isRef` or `__v_isReactive` flag) that shadows a known reactive source.
**Evidence:** `{ key: string, expectedReactive: boolean, actualType: string, componentName: string }`

### `computed_deps_not_tracked`

**Severity:** medium
**Description:** A computed property was accessed but no reactive dependencies were tracked during its evaluation, likely due to async access or accessing the value outside the reactive scope.
**Detection:** Use `onTrack` in dev mode — if a computed's getter runs but no `track` events fire, the computed has no dependencies and will never update.
**Evidence:** `{ computedKey: string, componentName: string, accessCount: number }`

### `watcher_infinite_loop`

**Severity:** high
**Description:** A watcher or component re-renders in an unbounded loop, typically caused by a watcher that mutates its own dependency.
**Detection:** Track per-component update frequency. If a single component fires `component:updated` more than 30 times within 2 seconds, flag as infinite loop.
**Evidence:** `{ componentName: string, updateCount: number, windowMs: number, lastKeys: string[] }`

### `vue2_missing_set`

**Severity:** medium
**Description:** A new property was added to a reactive object without using `Vue.set()` or `this.$set()`, so Vue 2's `Object.defineProperty`-based reactivity will not track it.
**Detection:** Compare `$data` property keys across updates. If a new key appears that was not present in the previous snapshot and no corresponding `$set` call was observed, flag.
**Evidence:** `{ key: string, objectPath: string, componentName: string }`

### `pinia_mutation_outside_action`

**Severity:** low
**Description:** A Pinia store's state was directly mutated outside of an action, bypassing devtools tracking and time-travel debugging.
**Detection:** When `$subscribe` fires with `mutation.type === "direct"` and no active action context exists (tracked via `$onAction`).
**Evidence:** `{ storeId: string, mutationType: string, keys: string[] }`
