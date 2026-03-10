# React Internals -- Debug Interface Reference

This document describes the React internal APIs and data structures we hook into for framework state observation. It is a reference for implementors working on the React observer.

---

## `__REACT_DEVTOOLS_GLOBAL_HOOK__`

React's reconciler checks for `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` at module evaluation time (during the first `import` or `require` of `react-dom`). If present and `supportsFiber` is truthy, the reconciler calls `inject(renderer)` and subsequently calls `onCommitFiberRoot` and `onCommitFiberUnmount` on every commit.

### Full API Surface

| Method / Property | Called by | Purpose |
|---|---|---|
| `supportsFiber` | React (read) | Must be `true` for fiber-based React (16+) |
| `inject(renderer)` | React renderer init | Registers a renderer; returns a numeric ID |
| `onCommitFiberRoot(id, fiberRoot, priority?)` | React reconciler | Fires after every synchronous commit phase |
| `onCommitFiberUnmount(id, fiber)` | React reconciler | Fires before a fiber is removed from the tree |
| `onPostCommitFiberRoot(id, fiberRoot)` | React reconciler (18+) | Fires after passive effects flush |
| `renderers` | DevTools / us | `Map<number, ReactRenderer>` of registered renderers |
| `getFiberRoots(id)` | DevTools / us | Returns `Set<FiberRoot>` for a renderer |
| `checkDCE(fn)` | React (dev only) | Dead code elimination check; we provide a no-op |
| `isDisabled` | React (read) | If truthy, React skips all hook calls |

### Injection Requirements

The hook **must** be installed before React's module body executes. There is no second chance -- React reads the global once at import time and caches the reference. Our `Page.addScriptToEvaluateOnNewDocument` injection guarantees this timing.

### Renderer ID Management

`inject()` must return a stable, unique numeric ID. We use an incrementing counter starting at 1. The ID is opaque to React -- it just passes it back to us in `onCommitFiberRoot` and `onCommitFiberUnmount` so we can look up the renderer.

```typescript
let nextRendererId = 1;
const renderers = new Map<number, ReactRenderer>();
const fiberRoots = new Map<number, Set<FiberRoot>>();

function inject(renderer: ReactRenderer): number {
	const id = nextRendererId++;
	renderers.set(id, renderer);
	fiberRoots.set(id, new Set());
	return id;
}

function getFiberRoots(rendererId: number): Set<FiberRoot> {
	return fiberRoots.get(rendererId) ?? new Set();
}
```

---

## Fiber Tree Traversal

### Depth-First Walk

The fiber tree uses child/sibling pointers (not an array of children). Traversal is always depth-first:

```typescript
function traverseFiber(
	root: Fiber,
	visit: (fiber: Fiber, depth: number) => boolean | void,
	maxDepth = 100,
): void {
	const stack: Array<{ fiber: Fiber; depth: number }> = [{ fiber: root, depth: 0 }];

	while (stack.length > 0) {
		const { fiber, depth } = stack.pop()!;
		if (depth > maxDepth) continue;

		// visit() returns true to skip children
		const skipChildren = visit(fiber, depth);

		// Push sibling first (processed after children due to stack LIFO)
		if (fiber.sibling) {
			stack.push({ fiber: fiber.sibling, depth });
		}
		// Push child (processed next)
		if (!skipChildren && fiber.child) {
			stack.push({ fiber: fiber.child, depth: depth + 1 });
		}
	}
}
```

Use an explicit stack, not recursion. React apps routinely have tree depths of 50+ and component counts in the thousands. Recursive traversal risks stack overflow.

### Finding Changed Fibers

After a commit, `fiberRoot.current` is the committed tree. Each fiber has an `alternate` pointing to its counterpart from the previous render. A fiber that was updated in this commit can be identified by:

```typescript
function fiberWasUpdated(fiber: Fiber): boolean {
	if (!fiber.alternate) {
		// New mount -- no previous version
		return true;
	}
	// Props or state changed
	return (
		fiber.memoizedProps !== fiber.alternate.memoizedProps ||
		fiber.memoizedState !== fiber.alternate.memoizedState ||
		fiber.ref !== fiber.alternate.ref
	);
}
```

This is a reference equality check, which is exactly how React's bailout logic works (`oldProps === newProps`). If props are a new object (even with identical contents), the fiber is considered updated.

### Component Name Extraction

```typescript
function getComponentName(fiber: Fiber): string {
	if (typeof fiber.type === "string") {
		return fiber.type; // HostComponent, e.g. "div"
	}
	if (typeof fiber.type === "function") {
		return fiber.type.displayName || fiber.type.name || "Anonymous";
	}
	if (typeof fiber.type === "object" && fiber.type !== null) {
		// ForwardRef, Memo, Lazy
		if (fiber.type.displayName) return fiber.type.displayName;
		if (fiber.type.render?.displayName) return fiber.type.render.displayName;
		if (fiber.type.render?.name) return `ForwardRef(${fiber.type.render.name})`;
		if (fiber.type.type?.displayName) return `Memo(${fiber.type.type.displayName})`;
		if (fiber.type.type?.name) return `Memo(${fiber.type.type.name})`;
	}
	return "Unknown";
}
```

### Component Path Computation

Build the ancestor chain by walking `fiber.return` up to the HostRoot:

```typescript
function getComponentPath(fiber: Fiber): string {
	const parts: string[] = [];
	let current: Fiber | null = fiber;
	while (current) {
		// Only include user components, not host elements or internal wrappers
		if (current.tag === 0 || current.tag === 1 || current.tag === 11 || current.tag === 14 || current.tag === 15) {
			const name = getComponentName(current);
			if (name !== "Anonymous" && name !== "Unknown") {
				parts.unshift(name);
			}
		}
		current = current.return;
	}
	return parts.join(" > ");
}
```

---

## State Extraction

### Hooks Linked List

For function components (tags 0, 11, 14, 15), `fiber.memoizedState` is the head of a linked list. Each node has a `next` pointer.

```typescript
interface HookNode {
	memoizedState: any;
	baseState?: any;
	baseQueue?: any;
	queue?: HookQueue | null;
	next: HookNode | null;
}
```

Walk the list and classify each hook:

```typescript
function extractHooksState(fiber: Fiber): HookInfo[] {
	const hooks: HookInfo[] = [];
	let hook = fiber.memoizedState;
	let index = 0;

	while (hook !== null) {
		const info = classifyHook(hook, index);
		hooks.push(info);
		hook = hook.next;
		index++;
	}
	return hooks;
}

interface HookInfo {
	index: number;
	type: "state" | "reducer" | "effect" | "layoutEffect" | "ref" | "memo" | "callback" | "id" | "transition" | "unknown";
	value: unknown;
	deps?: unknown[] | null;
}

function classifyHook(hook: HookNode, index: number): HookInfo {
	const ms = hook.memoizedState;

	// useRef: { current: ... } with no queue
	if (ms !== null && typeof ms === "object" && "current" in ms && !hook.queue && !("create" in ms)) {
		return { index, type: "ref", value: ms.current };
	}

	// useEffect / useLayoutEffect: { create, destroy, deps, tag }
	if (ms !== null && typeof ms === "object" && "create" in ms && "destroy" in ms && "tag" in ms) {
		const isLayout = (ms.tag & 4) !== 0;  // Layout = 0b0100
		return {
			index,
			type: isLayout ? "layoutEffect" : "effect",
			value: ms.destroy !== undefined ? "[has cleanup]" : "[no cleanup]",
			deps: ms.deps,
		};
	}

	// useMemo / useCallback: [value, deps] tuple
	if (Array.isArray(ms) && ms.length === 2 && (Array.isArray(ms[1]) || ms[1] === null)) {
		return { index, type: "memo", value: ms[0], deps: ms[1] };
	}

	// useId: string value, no queue
	if (typeof ms === "string" && ms.startsWith(":") && !hook.queue) {
		return { index, type: "id", value: ms };
	}

	// useTransition: boolean isPending with queue
	if (typeof ms === "boolean" && hook.queue) {
		return { index, type: "transition", value: ms };
	}

	// useState / useReducer: has a queue with dispatch
	if (hook.queue && typeof hook.queue.dispatch === "function") {
		return { index, type: "state", value: ms };
	}

	return { index, type: "unknown", value: ms };
}
```

### Class Component State

For class components (tag 1), state extraction is straightforward:

```typescript
// fiber.memoizedState is the this.state object directly
const state = fiber.memoizedState; // e.g. { count: 5, name: "test" }
// fiber.stateNode is the class instance, so fiber.stateNode.state === fiber.memoizedState
```

---

## Props Extraction

### `memoizedProps` vs `pendingProps`

- `fiber.memoizedProps`: The props from the most recently committed render. This is what we should read.
- `fiber.pendingProps`: The props for the current in-progress render. During a commit callback, these are equal to `memoizedProps` for completed work.

Always read `memoizedProps` in our `onCommitFiberRoot` callback, as the commit is already finished.

### Props Diff

```typescript
function diffProps(prev: Record<string, any> | null, next: Record<string, any>): Array<{ key: string; prev: any; next: any }> {
	const changes: Array<{ key: string; prev: any; next: any }> = [];
	if (!prev) return Object.keys(next).map((key) => ({ key, prev: undefined, next: next[key] }));

	const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
	for (const key of allKeys) {
		if (key === "children") continue; // Skip children prop (too large, not useful)
		if (prev[key] !== next[key]) {
			changes.push({ key, prev: prev[key], next: next[key] });
		}
	}
	return changes;
}
```

---

## Context Extraction

Context consumers are tracked via `fiber.dependencies` (React 17+) or `fiber.contextDependencies` (React 16).

```typescript
function getConsumedContexts(fiber: Fiber): ReactContext[] {
	const deps = (fiber as any).dependencies ?? (fiber as any).contextDependencies;
	if (!deps?.firstContext) return [];

	const contexts: ReactContext[] = [];
	let dep = deps.firstContext;
	while (dep !== null) {
		contexts.push(dep.context);
		dep = dep.next;
	}
	return contexts;
}
```

To detect context-triggered re-renders, compare the context value on the provider's `memoizedProps.value` against `alternate.memoizedProps.value`:

```typescript
function contextValueChanged(providerFiber: Fiber): boolean {
	if (!providerFiber.alternate) return true;
	return providerFiber.memoizedProps.value !== providerFiber.alternate.memoizedProps.value;
}
```

---

## Error Boundary Detection

Error boundaries are class components that implement `getDerivedStateFromError` and/or `componentDidCatch`.

```typescript
function isErrorBoundary(fiber: Fiber): boolean {
	if (fiber.tag !== 1) return false; // Must be ClassComponent
	const instance = fiber.stateNode;
	const ctor = fiber.type;
	return (
		typeof ctor.getDerivedStateFromError === "function" ||
		(instance !== null && typeof instance.componentDidCatch === "function")
	);
}
```

### Detecting Caught Errors

When an error boundary catches an error, React sets the `DidCapture` flag on the boundary fiber:

```typescript
const DidCapture = 0b000000000000000010000000; // 128

function didCaptureError(fiber: Fiber): boolean {
	const flags = fiber.flags ?? fiber.effectTag ?? 0;
	return (flags & DidCapture) !== 0;
}
```

The caught error is stored in the boundary's state as part of `getDerivedStateFromError` processing. Check `fiber.memoizedState` for error-related state after a commit where `DidCapture` is set.

---

## DOM Node to Fiber Lookup

React attaches a reference from each DOM node back to its fiber. The property key is a random suffix to avoid collisions.

### React 17+ Pattern

```typescript
// Property key format: __reactFiber$<randomSuffix>
// Props key format:    __reactProps$<randomSuffix>
function getFiberFromDOMNode(node: Element): Fiber | null {
	const fiberKey = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
	return fiberKey ? (node as any)[fiberKey] : null;
}

function getPropsFromDOMNode(node: Element): Record<string, any> | null {
	const propsKey = Object.keys(node).find((k) => k.startsWith("__reactProps$"));
	return propsKey ? (node as any)[propsKey] : null;
}
```

### React 16 Pattern

```typescript
// Property key format: __reactInternalInstance$<randomSuffix>
function getFiberFromDOMNodeLegacy(node: Element): Fiber | null {
	const key = Object.keys(node).find((k) => k.startsWith("__reactInternalInstance$"));
	return key ? (node as any)[key] : null;
}
```

### Unified Lookup

```typescript
function getFiberFromDOM(node: Element): Fiber | null {
	const key = Object.keys(node).find(
		(k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
	);
	return key ? (node as any)[key] : null;
}
```

---

## Key Libraries

### bippy

[bippy](https://github.com/niccolodevitis/bippy) is a lightweight React instrumentation library. Relevant utilities:

- `instrument({ onCommitFiberRoot, onCommitFiberUnmount })` -- Installs the devtools hook and registers callbacks. Handles the edge case where React has already loaded by patching retroactively.
- `traverseFiber(root, callback)` -- Depth-first traversal using the child/sibling pattern.
- `traverseState(fiber, callback)` -- Walks the hooks linked list (`memoizedState.next` chain).
- `getFiberName(fiber)` -- Component name extraction with ForwardRef/Memo unwrapping.
- `isCompositeFiber(fiber)` -- Checks if tag is 0, 1, 11, 14, or 15 (user components).

We do not depend on bippy at runtime (we implement our own traversal in the injection script), but it serves as a reference implementation and test oracle.

### react-scan

[react-scan](https://github.com/aidenybai/react-scan) is an inspection tool that detects unnecessary re-renders. Relevant patterns:

- **Render counting**: Tracks per-fiber render counts using a WeakMap keyed by fiber identity.
- **Change detection**: Compares `fiber.memoizedProps` / `fiber.memoizedState` against `alternate` using reference equality, then falls back to shallow comparison for "unnecessary render" detection.
- **Throttled reporting**: Uses `requestAnimationFrame` to batch visual updates.

### React DevTools

The official React DevTools extension (`react-devtools-shared` package) is the canonical reference for fiber inspection. Key patterns we borrow:

- **Dehydration**: DevTools sends a "dehydrated" representation of deep objects, replacing nested values with placeholder tokens until the user expands them. We adopt a similar approach -- only serialize state to a configured depth.
- **Operations-based patching**: DevTools sends incremental "operations" arrays (mount/update/unmount per fiber) rather than full tree snapshots. Our approach is simpler (we walk changed fibers only) but follows the same principle of minimizing data transfer.
- **inspectElement lazy loading**: Full state/props for a component are only fetched when the user selects it. We similarly only serialize full state on `session_inspect`, not on every commit.

---

## Performance Notes

### Expensive Operations

| Operation | Cost | When it hurts |
|-----------|------|---------------|
| Full tree traversal | O(n) where n = total fiber count | Apps with 5,000+ components |
| Deep state serialization | O(d * k) where d = depth, k = keys per level | Components with large state trees (Redux stores) |
| `Object.keys(domNode)` for fiber lookup | O(k) where k = properties on the node | Called per DOM node; avoid in hot paths |
| `JSON.stringify` for event reporting | O(s) where s = serialized size | Large state snapshots saturate the console channel |
| Hooks linked list walk | O(h) where h = hooks per component | Rarely more than ~20 hooks; negligible |

### Mitigation Strategies

1. **Skip unchanged subtrees**: If `fiber.memoizedProps === fiber.alternate.memoizedProps && fiber.memoizedState === fiber.alternate.memoizedState`, skip the entire subtree (no children changed).

2. **Depth limit**: Never serialize state deeper than the configured limit (default: 3 levels). Replace deeper values with `"[Object]"` or `"[Array(n)]"` placeholders.

3. **Throttle commits**: Use `requestAnimationFrame` to coalesce multiple synchronous commits into one processing pass. Enforce a maximum of 10 events/second to the `__BL__` channel.

4. **Lazy inspection**: On every commit, emit only the component name, change type, and render count. Full state/props diff is computed only for components that match auto-detection patterns or when explicitly requested via `session_inspect`.

5. **WeakMap tracking**: Use `WeakMap<Fiber, ComponentTrackingData>` for render counters and state snapshots. Fibers are garbage-collected when components unmount, so the WeakMap self-cleans.

6. **String truncation**: Truncate string values at 200 characters in event data. The full value is available via `session_inspect`.

### DevTools Overhead Reference

React DevTools, when connected, adds approximately 5-15% overhead to commit processing (measured on a 1,000-component app with frequent updates). Our observer targets lower overhead by skipping the operations encoding and tree serialization that DevTools performs. Target: < 5% overhead on commit-heavy workloads.
