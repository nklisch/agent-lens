# Vue Internals — Debug Interface Reference

This document catalogs the internal Vue APIs and data structures used for framework state observation. It covers the devtools hook, component tree traversal, state extraction, reactivity debugging, store access, and DOM lookups for both Vue 2 and Vue 3.

---

## `__VUE_DEVTOOLS_GLOBAL_HOOK__`

### Event Emitter API

The hook implements a minimal event emitter. All framework communication flows through it:

```typescript
// Register a listener
hook.on("component:updated", (instance, app) => { ... });

// Register a one-time listener
hook.once("app:init", (app, version) => { ... });

// Remove a listener
hook.off("component:updated", handler);

// Emit an event (called by Vue internals, not by us)
hook.emit("component:added", instance, app);
```

### Registration Flow

1. Injection script creates the hook on `window` via `Page.addScriptToEvaluateOnNewDocument`.
2. Vue detects the hook during module initialization (`createApp()` checks `window.__VUE_DEVTOOLS_GLOBAL_HOOK__`).
3. Vue sets `hook.enabled = true` internally if the hook exists.
4. Vue calls `hook.emit('app:init', app, version, env)` during mount.
5. Subsequent component lifecycle events flow through `hook.emit(...)`.

### Buffer/Replay Mechanism

Events emitted before any listener is registered are buffered in `hook._buffer`:

```typescript
// Injection script initializes the buffer
hook._buffer = [];

// Before listeners exist, emit() appends to buffer
hook.emit = function(event, ...args) {
	this._buffer.push([event, ...args]);
	// ...normal emit to registered listeners
};
```

When the observer first calls `hook.on()`, it should drain `_buffer` and process each buffered event:

```typescript
function drainBuffer(hook: VueDevtoolsGlobalHook): void {
	const buffered = hook._buffer || [];
	hook._buffer = [];
	for (const [event, ...args] of buffered) {
		handleEvent(event, args);
	}
}
```

### 3-Second Timeout Behavior

Vue 3.x internally applies a 3-second timeout: if no devtools connects (calls `hook.on('app:init', ...)`) within 3 seconds of the first `app:init` emit, Vue stops emitting devtools events to avoid overhead. Our injection script must register listeners immediately — not lazily — to avoid this cutoff.

The injection script should call `hook.on(...)` for all relevant events synchronously during script evaluation, before any Vue code runs. Since our script runs via `Page.addScriptToEvaluateOnNewDocument`, this is guaranteed.

---

## Vue 3 Component Tree Traversal

### From App to Root Instance

```typescript
const rootInstance = app._instance; // ComponentInternalInstance
```

### Walking the Instance Tree

Vue 3 does not expose a `$children` array. Instead, traverse the VNode subtree:

```typescript
function getChildInstances(instance: ComponentInternalInstance): ComponentInternalInstance[] {
	const children: ComponentInternalInstance[] = [];

	function walk(vnode: VNode): void {
		if (vnode.component) {
			// This VNode represents a child component
			children.push(vnode.component);
		} else if (vnode.shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
			// Fragment or element with multiple children
			const vnodes = vnode.children as VNode[];
			for (const child of vnodes) {
				walk(child);
			}
		}
	}

	if (instance.subTree) {
		walk(instance.subTree);
	}
	return children;
}
```

**Key VNode shape flags:**

```typescript
const enum ShapeFlags {
	ELEMENT = 1,
	FUNCTIONAL_COMPONENT = 1 << 1,
	STATEFUL_COMPONENT = 1 << 2,
	ARRAY_CHILDREN = 1 << 4,
	COMPONENT = STATEFUL_COMPONENT | FUNCTIONAL_COMPONENT,
}
```

### Full Tree Traversal

```typescript
function walkTree(
	instance: ComponentInternalInstance,
	visitor: (instance: ComponentInternalInstance, depth: number) => void,
	depth = 0
): void {
	visitor(instance, depth);
	for (const child of getChildInstances(instance)) {
		walkTree(child, visitor, depth + 1);
	}
}

// Usage: count all components
let count = 0;
walkTree(app._instance, () => count++);
```

---

## Vue 2 Component Tree Traversal

### Root Access

```typescript
// From the hook
const roots: Vue2Instance[] = [];
hook.on("component:added", (vm) => {
	if (!vm.$parent) roots.push(vm);
});

// From a known root
const root = vm.$root;
```

### Walking via `$children`

```typescript
function walkTree2(
	vm: Vue2Instance,
	visitor: (vm: Vue2Instance, depth: number) => void,
	depth = 0
): void {
	visitor(vm, depth);
	for (const child of vm.$children) {
		walkTree2(child, visitor, depth + 1);
	}
}
```

### DOM-to-Instance Lookup

```typescript
// Vue 2: any mounted element has __vue__
const vm = element.__vue__;
```

---

## State Extraction — Vue 3

### `setupState` (Composition API)

`setupState` contains the return value of `setup()`, wrapped in `proxyRefs`. Refs are auto-unwrapped — accessing `instance.setupState.count` returns the raw value, not a `Ref` object.

```typescript
function extractSetupState(instance: ComponentInternalInstance): Record<string, unknown> {
	const state: Record<string, unknown> = {};
	const raw = instance.setupState;

	for (const key of Object.keys(raw)) {
		// Skip internal keys (prefixed with $ or _)
		if (key.startsWith("$") || key.startsWith("_")) continue;
		// Skip functions (methods, event handlers)
		if (typeof raw[key] === "function") continue;

		state[key] = raw[key]; // Already unwrapped by proxyRefs
	}
	return state;
}
```

### `data` (Options API)

When a component uses the Options API `data()` function, the return value is stored in `instance.data` as a `reactive()` object:

```typescript
function extractOptionsData(instance: ComponentInternalInstance): Record<string, unknown> {
	if (!instance.data || Object.keys(instance.data).length === 0) return {};
	return { ...instance.data };
}
```

### Props

```typescript
function extractProps(instance: ComponentInternalInstance): Record<string, unknown> {
	return { ...instance.props };
}
```

### Computed Properties

Computed values are accessed through the component proxy. There is no direct `computedState` property — computed properties are defined on the instance's accessor context and accessed via `instance.proxy`:

```typescript
function extractComputed(instance: ComponentInternalInstance): Record<string, unknown> {
	const computed: Record<string, unknown> = {};
	const type = instance.type;

	if (type.computed) {
		for (const key of Object.keys(type.computed)) {
			try {
				computed[key] = instance.proxy?.[key];
			} catch {
				computed[key] = "<error>";
			}
		}
	}
	return computed;
}
```

### Provides

```typescript
function extractProvides(instance: ComponentInternalInstance): Record<string, unknown> {
	// Only own provides, not inherited
	const parentProvides = instance.parent?.provides;
	const provides = instance.provides;
	if (provides === parentProvides) return {}; // No own provides

	const result: Record<string, unknown> = {};
	for (const key of Object.keys(provides)) {
		result[key] = provides[key];
	}
	return result;
}
```

---

## State Extraction — Vue 2

### `$data`

```typescript
function extractData2(vm: Vue2Instance): Record<string, unknown> {
	return { ...vm.$data };
}
```

### `_computedWatchers`

```typescript
function extractComputed2(vm: Vue2Instance): Record<string, unknown> {
	const computed: Record<string, unknown> = {};
	if (vm._computedWatchers) {
		for (const [key, watcher] of Object.entries(vm._computedWatchers)) {
			computed[key] = watcher.value;
		}
	}
	return computed;
}
```

### `_watchers`

```typescript
interface Vue2Watcher {
	expression: string;  // The watch source expression
	value: unknown;      // Current value
	cb: Function;        // The callback
	deep: boolean;
	lazy: boolean;       // true for computed watchers
	id: number;
}

function extractWatchers2(vm: Vue2Instance): Array<{ expression: string; value: unknown }> {
	return (vm._watchers || [])
		.filter((w) => !w.lazy) // Exclude computed watchers
		.map((w) => ({ expression: w.expression, value: w.value }));
}
```

### `$props` and `_provided`

```typescript
const props = { ...vm.$props };
const provided = { ...vm._provided };
```

---

## Reactivity Debugging Hooks (Vue 3)

Vue 3 `computed()`, `watch()`, and `watchEffect()` accept `onTrack` and `onTrigger` callbacks in dev mode only. These fire when reactive dependencies are tracked or when a dependency change triggers re-evaluation.

### Event Shape

```typescript
interface DebuggerEvent {
	/** The reactive effect being tracked/triggered. */
	effect: ReactiveEffect;

	/** The target object being observed. */
	target: object;

	/** The operation type. */
	type: "get" | "has" | "iterate" | "set" | "add" | "delete" | "clear";

	/** The property key accessed or mutated. */
	key: string | symbol;

	/** For "set": the new value. */
	newValue?: unknown;

	/** For "set": the old value. */
	oldValue?: unknown;
}
```

### Usage in Computed

```typescript
const doubled = computed(() => count.value * 2, {
	onTrack(event) {
		// Fired during evaluation when a dependency is read
		// event.target = the reactive source, event.key = the accessed property
	},
	onTrigger(event) {
		// Fired when a dependency changes, before re-evaluation
		// event.type = "set", event.key = the mutated property
	},
});
```

### Limitations

- **Dev mode only.** These callbacks are stripped in production builds. Our observer must detect the build mode and skip reactivity hook setup for production bundles.
- **Cannot be attached externally.** `onTrack`/`onTrigger` must be passed at creation time. We cannot retroactively attach them to existing computed properties. They are primarily useful for detecting patterns in components that use them, or for our own injected watchers.

### External Observation via `@vue/reactivity`

For observing existing state without modifying component code, use `watch()` or `effect()` from Vue's reactivity module:

```typescript
import { watch, effect } from "@vue/reactivity";

// Watch a specific reactive source
const stop = watch(
	() => instance.setupState.someValue,
	(newVal, oldVal) => {
		reportChange("someValue", oldVal, newVal);
	}
);

// General reactive effect — re-runs whenever accessed deps change
const runner = effect(() => {
	const snapshot = captureState(instance);
	reportState(snapshot);
});
```

In the injection context, `watch` and `effect` are not directly importable. Instead, access them through the Vue app's internals or install a minimal reactive observer alongside the hook shim.

---

## Store Access

### Pinia

**Discovery:**

```typescript
// Via app provides (Vue 3)
const pinia = app._context.provides[piniaSymbol];
// The symbol is not exported — find it by iterating provides:
const pinia = Object.values(app._context.provides).find(
	(v) => v && typeof v === "object" && "_s" in v && v._s instanceof Map
);

// Via global helper if available
const pinia = window.__pinia__;
```

**Store map:**

```typescript
// pinia._s is a Map<string, StoreGeneric>
for (const [id, store] of pinia._s) {
	console.log(id, store.$state);
}
```

**Subscribing to mutations:**

```typescript
store.$subscribe(
	(mutation, state) => {
		// mutation.type: "direct" | "patch object" | "patch function"
		// mutation.storeId: string
		// mutation.events: DebuggerEvent | DebuggerEvent[] (dev mode only)
		reportStoreChange(mutation.storeId, mutation.type, state);
	},
	{ detached: true } // survives component unmount
);
```

**Subscribing to actions:**

```typescript
store.$onAction(
	({ name, store, args, after, onError }) => {
		const startTime = Date.now();

		after((result) => {
			reportAction(store.$id, name, args, result, Date.now() - startTime);
		});

		onError((error) => {
			reportActionError(store.$id, name, args, error);
		});
	},
	true // detached
);
```

### Vuex

**Discovery:**

```typescript
// Vue 3
const store = app.config.globalProperties.$store;

// Vue 2
const store = vm.$store;
```

**Subscribing to mutations:**

```typescript
store.subscribe((mutation, state) => {
	// mutation.type: "moduleName/MUTATION_NAME"
	// mutation.payload: unknown
	reportStoreChange(mutation.type, mutation.payload, state);
});
```

**Subscribing to actions:**

```typescript
store.subscribeAction(
	{
		before(action, state) {
			// action.type: "moduleName/actionName"
			// action.payload: unknown
		},
		after(action, state) {
			reportAction(action.type, action.payload, state);
		},
		error(action, state, error) {
			reportActionError(action.type, error);
		},
	}
);
```

**Accessing state and getters:**

```typescript
// Direct state access (namespaced by module)
store.state.moduleName.someValue;

// Getters
store.getters["moduleName/someGetter"];
```

---

## DOM Node Lookups

### Vue 3

```typescript
// Get the app instance from a DOM element
const app = element.__vue_app__;

// Get the VNode context (the component instance that owns this element)
const instance = element.__vnode_context__;
```

Both properties are set on the element during mount and removed during unmount.

### Vue 2

```typescript
// Get the component instance from a DOM element
const vm = element.__vue__;
```

This is set on `vm.$el` during mount. If the element is nested inside a component's template but is not the root element, `__vue__` will not be set — only the component's root element carries the reference.

---

## Performance Notes

### Lazy State Serialization

State extraction (walking `setupState`, `$data`, `props`, etc.) should be deferred until the event is actually about to be reported via `__BL__`. Do not eagerly serialize component state on every `component:updated` event — many updates will be throttled away before reporting.

```typescript
// Bad: serialize on every event
hook.on("component:updated", (instance) => {
	const state = extractFullState(instance); // expensive
	reportUpdate(instance, state); // may be throttled and discarded
});

// Good: defer serialization
hook.on("component:updated", (instance) => {
	markDirty(instance); // O(1) — just set a flag
});

// In throttled flush:
function flush(): void {
	for (const instance of dirtyInstances) {
		const state = extractFullState(instance); // only for instances that survived throttle
		report(instance, state);
	}
	dirtyInstances.clear();
}
```

### Throttled Tree Updates

Full tree walks (counting components, computing paths) should be throttled to at most once per second. Individual component state changes do not require a full tree walk — only mount and unmount events change the tree structure.

### Bounded Event Buffers

The `_buffer` array on the hook can grow unboundedly if no consumer drains it. In a large app with hundreds of components mounting during initial render, this can cause significant memory pressure.

**Mitigation (commit 24f4c47 pattern):** Cap `_buffer` at a fixed size (e.g., 1000 entries). When the cap is reached, drop oldest entries. This matches the `RollingBuffer` strategy used in the rest of Browser Lens:

```typescript
const MAX_BUFFER = 1000;
const originalEmit = hook.emit.bind(hook);

hook.emit = function (event: string, ...args: unknown[]) {
	if (hook._buffer.length >= MAX_BUFFER) {
		hook._buffer.shift(); // Drop oldest
	}
	hook._buffer.push([event, ...args]);
	return originalEmit(event, ...args);
};
```

### Memory Leak Prevention

- Always call unsubscribe functions returned by `$subscribe`, `$onAction`, `store.subscribe`, and `store.subscribeAction` during cleanup.
- Use `{ detached: true }` for store subscriptions so they survive component unmounts but can be explicitly cleaned up during session teardown.
- Remove `hook.on()` listeners when the observer is destroyed.
- Clear the `_buffer` after draining to release references to component instances.
