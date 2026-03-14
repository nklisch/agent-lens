# React Observer -- Architecture

This document describes the implementation architecture for the React framework state observer: the injection script, the observer flow, state diffing, bug pattern detection, and how everything integrates into the existing Browser Lens pipeline.

---

## File Layout

```
src/browser/recorder/framework/
  index.ts                     # FrameworkTracker orchestrator
  detector.ts                  # Auto-detect which framework loaded (from __BL__ events)
  react-observer.ts            # ReactObserver class: manages injection + event processing
  react-injection.ts           # getReactInjectionScript() — the script injected into the page
  react-fiber-utils.ts         # Fiber traversal, name extraction, state reading (shared helpers)
  patterns/
    react-patterns.ts          # Bug pattern detectors for React
```

---

## Injection Script

The injection script is a self-contained IIFE injected via `Page.addScriptToEvaluateOnNewDocument` before any page scripts load. It installs `__REACT_DEVTOOLS_GLOBAL_HOOK__` and reports events through the existing `console.debug('__BL__', ...)` channel.

### Complete Script Structure

```typescript
export function getReactInjectionScript(config: ReactObserverConfig): string {
	return `(function() {
	// ===== CONFIGURATION =====
	var MAX_EVENTS_PER_SECOND = ${config.maxEventsPerSecond ?? 10};
	var MAX_DEPTH = ${config.maxSerializationDepth ?? 3};
	var STALE_CLOSURE_THRESHOLD = ${config.staleClosureThreshold ?? 5};
	var INFINITE_RERENDER_THRESHOLD = ${config.infiniteRerenderThreshold ?? 15};
	var INFINITE_RERENDER_WINDOW_MS = 1000;
	var CONTEXT_RERENDER_THRESHOLD = ${config.contextRerenderThreshold ?? 20};

	// ===== STATE =====
	var nextRendererId = 1;
	var renderers = {};          // id -> renderer
	var fiberRootsMap = {};      // id -> Set<FiberRoot>
	var componentTracking = new WeakMap();  // Fiber -> { renderCount, prevState, prevProps, renderTimestamps, prevDeps }
	var eventQueue = [];
	var lastFlushTime = 0;
	var rafScheduled = false;
	var detected = false;

	// ===== REPORTING =====
	function report(type, data) {
		try {
			console.debug('__BL__', JSON.stringify({
				type: 'framework_' + type,
				ts: Date.now(),
				data: data
			}));
		} catch (e) {}
	}

	function queueEvent(type, data) {
		eventQueue.push({ type: type, data: data });
		if (!rafScheduled) {
			rafScheduled = true;
			requestAnimationFrame(flushEvents);
		}
	}

	function flushEvents() {
		rafScheduled = false;
		var now = Date.now();
		var elapsed = now - lastFlushTime;
		var budget = Math.floor(MAX_EVENTS_PER_SECOND * (elapsed / 1000));
		if (budget < 1) budget = 1;

		var toSend = eventQueue.splice(0, budget);
		for (var i = 0; i < toSend.length; i++) {
			report(toSend[i].type, toSend[i].data);
		}
		lastFlushTime = now;

		// If events remain, schedule another frame
		if (eventQueue.length > 0) {
			rafScheduled = true;
			requestAnimationFrame(flushEvents);
		}
	}

	// ===== SERIALIZATION =====
	function serialize(value, depth) {
		if (depth === undefined) depth = 0;
		if (depth >= MAX_DEPTH) {
			if (Array.isArray(value)) return '[Array(' + value.length + ')]';
			if (value && typeof value === 'object') return '[Object]';
			return value;
		}
		if (value === null || value === undefined) return value;
		if (typeof value === 'function') return '[Function: ' + (value.name || 'anonymous') + ']';
		if (typeof value === 'symbol') return value.toString();
		if (typeof value !== 'object') {
			if (typeof value === 'string' && value.length > 200) return value.slice(0, 200) + '...';
			return value;
		}
		if (Array.isArray(value)) {
			var arr = [];
			for (var i = 0; i < Math.min(value.length, 10); i++) {
				arr.push(serialize(value[i], depth + 1));
			}
			if (value.length > 10) arr.push('...(' + (value.length - 10) + ' more)');
			return arr;
		}
		var obj = {};
		var keys = Object.keys(value);
		for (var k = 0; k < Math.min(keys.length, 20); k++) {
			try { obj[keys[k]] = serialize(value[keys[k]], depth + 1); } catch(e) { obj[keys[k]] = '[Error]'; }
		}
		if (keys.length > 20) obj['...'] = '(' + (keys.length - 20) + ' more keys)';
		return obj;
	}

	// ===== FIBER UTILITIES =====
	function getComponentName(fiber) {
		var type = fiber.type;
		if (typeof type === 'string') return type;
		if (typeof type === 'function') return type.displayName || type.name || 'Anonymous';
		if (type && typeof type === 'object') {
			if (type.displayName) return type.displayName;
			if (type.render) return 'ForwardRef(' + (type.render.displayName || type.render.name || '') + ')';
			if (type.type) return 'Memo(' + (type.type.displayName || type.type.name || '') + ')';
		}
		return 'Unknown';
	}

	function getComponentPath(fiber) {
		var parts = [];
		var current = fiber;
		while (current) {
			var tag = current.tag;
			if (tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15) {
				var name = getComponentName(current);
				if (name !== 'Anonymous' && name !== 'Unknown') parts.unshift(name);
			}
			current = current.return;
			if (parts.length > 10) break; // cap path depth
		}
		return parts.join(' > ');
	}

	function isUserComponent(fiber) {
		var tag = fiber.tag;
		return tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15;
	}

	function getFlags(fiber) {
		return fiber.flags !== undefined ? fiber.flags : (fiber.effectTag || 0);
	}

	function shallowEqual(a, b) {
		if (a === b) return true;
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		for (var i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	// ===== HOOK INSPECTION =====
	function classifyHook(hook, index) { /* ... see INTERFACE.md ... */ }

	function getHooksState(fiber) {
		var hooks = [];
		var h = fiber.memoizedState;
		var idx = 0;
		while (h !== null) {
			hooks.push({ index: idx, hook: h });
			h = h.next;
			idx++;
		}
		return hooks;
	}

	// ===== COMMIT PROCESSING =====
	${/* See "Observer Flow" section below */''}

	// ===== HOOK INSTALLATION =====
	if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
		// Hook already exists (another tool installed it). Patch it.
		var existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
		var origOnCommit = existing.onCommitFiberRoot;
		var origOnUnmount = existing.onCommitFiberUnmount;
		existing.onCommitFiberRoot = function(id, root, priority) {
			if (origOnCommit) origOnCommit.call(existing, id, root, priority);
			processCommit(id, root);
		};
		existing.onCommitFiberUnmount = function(id, fiber) {
			if (origOnUnmount) origOnUnmount.call(existing, id, fiber);
			processUnmount(id, fiber);
		};
	} else {
		window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
			supportsFiber: true,
			renderers: renderers,
			inject: function(renderer) {
				var id = nextRendererId++;
				renderers[id] = renderer;
				fiberRootsMap[id] = new Set();

				if (!detected) {
					detected = true;
					report('detect', {
						framework: 'react',
						version: renderer.version || 'unknown',
						bundleType: renderer.bundleType || 0,
						rootCount: 0,
						componentCount: 0,
						rendererIds: [id]
					});
				}
				return id;
			},
			onCommitFiberRoot: function(id, root, priority) {
				// Track roots
				if (fiberRootsMap[id]) fiberRootsMap[id].add(root);
				processCommit(id, root);
			},
			onCommitFiberUnmount: function(id, fiber) {
				processUnmount(id, fiber);
			},
			onPostCommitFiberRoot: function(id, root) {
				// Reserved for effect timing analysis
			},
			getFiberRoots: function(id) {
				return fiberRootsMap[id] || new Set();
			},
			checkDCE: function() {},
			isDisabled: false,
			_injectedAt: Date.now()
		};
	}
})();`;
}
```

### Key Design Decisions

- The script is a plain IIFE with no ES module syntax, no `let`/`const` (using `var` throughout for maximum browser compatibility).
- All state is local to the closure. Nothing leaks to the global scope except `__REACT_DEVTOOLS_GLOBAL_HOOK__`.
- If a hook already exists (React DevTools extension installed), we patch `onCommitFiberRoot` and `onCommitFiberUnmount` rather than replacing the hook. This allows both DevTools and our observer to function simultaneously.
- `WeakMap` is used for per-fiber tracking data so that unmounted fibers are garbage-collected.

---

## Observer Flow

The core observation loop:

```
React reconciler commit
  |
  v
onCommitFiberRoot(rendererId, fiberRoot)
  |
  v
processCommit(rendererId, fiberRoot)
  |
  +---> Walk fiberRoot.current (depth-first)
  |       |
  |       +---> For each user component fiber:
  |               |
  |               +---> Is this a new mount? (no alternate)
  |               |       => queueEvent("state", { changeType: "mount", ... })
  |               |
  |               +---> Is this an update? (alternate exists, state/props differ)
  |               |       => Compute diff, increment render counter
  |               |       => queueEvent("state", { changeType: "update", ... })
  |               |
  |               +---> Run bug pattern checks on this fiber
  |               |       => queueEvent("error", { pattern: ..., ... })
  |               |
  |               +---> Skip subtree if unchanged (optimization)
  |
  +---> Schedule RAF flush (coalesces events, enforces rate limit)
          |
          v
        flushEvents()
          |
          +---> For each event in budget:
                  console.debug("__BL__", JSON.stringify(event))
                    |
                    v
                  [CDP Runtime.consoleAPICalled]
                    |
                    v
                  EventPipeline.process() -> InputTracker -> RollingBuffer -> Persistence
```

### processCommit Implementation

```typescript
function processCommit(rendererId, fiberRoot) {
	var rootFiber = fiberRoot.current;
	if (!rootFiber) return;

	// Walk the tree looking for changed user components
	var stack = [rootFiber];
	var visited = 0;
	var MAX_VISIT = 5000; // Safety cap

	while (stack.length > 0 && visited < MAX_VISIT) {
		var fiber = stack.pop();
		visited++;

		if (isUserComponent(fiber)) {
			var tracking = componentTracking.get(fiber);
			// React double-buffers fibers — check alternate for existing tracking
			if (!tracking && fiber.alternate) tracking = componentTracking.get(fiber.alternate);
			if (!tracking) {
				// New mount
				tracking = {
					renderCount: 0,
					renderTimestamps: [],
					prevState: null,
					prevProps: null,
					prevDeps: {}
				};
			}
			componentTracking.set(fiber, tracking);

			var isMount = !fiber.alternate;
			var isUpdate = !isMount && (
				fiber.memoizedProps !== fiber.alternate.memoizedProps ||
				fiber.memoizedState !== fiber.alternate.memoizedState
			);

			if (isMount || isUpdate) {
				tracking.renderCount++;
				tracking.renderTimestamps.push(Date.now());
				// Trim old timestamps (keep last 2 seconds)
				var cutoff = Date.now() - 2000;
				tracking.renderTimestamps = tracking.renderTimestamps.filter(function(t) { return t > cutoff; });

				var changeType = isMount ? 'mount' : 'update';
				var componentName = getComponentName(fiber);

				var eventData = {
					framework: 'react',
					componentName: componentName,
					componentPath: getComponentPath(fiber),
					changeType: changeType,
					renderCount: tracking.renderCount
				};

				if (isUpdate) {
					eventData.changes = computeChanges(fiber, tracking);
					eventData.triggerSource = detectTriggerSource(fiber);
				}

				queueEvent('state', eventData);

				// Run pattern detectors
				checkPatterns(fiber, tracking, componentName);

				// Update tracking state
				tracking.prevProps = fiber.memoizedProps;
				tracking.prevState = fiber.memoizedState;
				updateDepsTracking(fiber, tracking);
			} else {
				// No change -- skip children (optimization)
				// Push sibling but not child
				if (fiber.sibling) stack.push(fiber.sibling);
				continue;
			}
		}

		// Push children and siblings
		if (fiber.sibling) stack.push(fiber.sibling);
		if (fiber.child) stack.push(fiber.child);
	}
}
```

### processUnmount Implementation

```typescript
function processUnmount(rendererId, fiber) {
	if (!isUserComponent(fiber)) return;

	var tracking = componentTracking.get(fiber);
	queueEvent('state', {
		framework: 'react',
		componentName: getComponentName(fiber),
		componentPath: getComponentPath(fiber),
		changeType: 'unmount',
		renderCount: tracking ? tracking.renderCount : 0
	});
	// WeakMap entry is cleaned up by GC when fiber is collected
}
```

---

## Component Tracking

Each user-component fiber gets a tracking record stored in a `WeakMap`:

```typescript
interface ComponentTrackingData {
	/** Total number of renders for this fiber. */
	renderCount: number;
	/** Recent render timestamps for rate detection. */
	renderTimestamps: number[];
	/** memoizedState from the previous commit (for diff). */
	prevState: any;
	/** memoizedProps from the previous commit (for diff). */
	prevProps: any;
	/** Per-hook deps from the previous commit (for stale closure detection). */
	prevDeps: Record<number, unknown[] | null>;
}
```

The `WeakMap` is keyed by fiber identity. When React unmounts a component, the fiber becomes unreachable and the WeakMap entry is garbage-collected. No manual cleanup is required.

### Component Path

The path is computed by walking `fiber.return` and collecting names of user-component ancestors. This produces strings like `"App > Layout > Sidebar > UserProfile"`. The path is capped at 10 segments to bound computation cost.

---

## State Change Diffing

### What Counts as a Meaningful Change

We compare the current fiber against its `alternate` (the previous committed version):

| Check | Meaning | Action |
|-------|---------|--------|
| `fiber.alternate === null` | First mount | Emit mount event |
| `fiber.memoizedProps !== alternate.memoizedProps` | Props changed (reference) | Emit update with prop diff |
| `fiber.memoizedState !== alternate.memoizedState` | State changed (reference) | Emit update with state diff |
| Both props and state are `===` | No change | Skip this fiber and its children |

### computeChanges

```typescript
function computeChanges(fiber, tracking) {
	var changes = [];

	// Props diff
	var prevProps = fiber.alternate ? fiber.alternate.memoizedProps : tracking.prevProps;
	var nextProps = fiber.memoizedProps;
	if (prevProps !== nextProps && prevProps && nextProps) {
		var allKeys = Object.keys(nextProps);
		for (var i = 0; i < allKeys.length; i++) {
			var key = allKeys[i];
			if (key === 'children') continue;
			if (prevProps[key] !== nextProps[key]) {
				changes.push({
					key: 'props.' + key,
					prev: serialize(prevProps[key]),
					next: serialize(nextProps[key])
				});
			}
		}
	}

	// State diff (hooks or class state)
	if (fiber.tag === 0 || fiber.tag === 11 || fiber.tag === 14 || fiber.tag === 15) {
		// Function component: walk hooks linked list
		var hooks = getHooksState(fiber);
		var prevHooks = fiber.alternate ? getHooksState(fiber.alternate) : [];
		for (var h = 0; h < hooks.length; h++) {
			var curr = hooks[h].hook;
			var prev = prevHooks[h] ? prevHooks[h].hook : null;
			// Only report state hooks (those with a queue)
			if (curr.queue && curr.queue.dispatch) {
				if (!prev || curr.memoizedState !== prev.memoizedState) {
					changes.push({
						key: 'state[' + h + ']',
						prev: prev ? serialize(prev.memoizedState) : undefined,
						next: serialize(curr.memoizedState)
					});
				}
			}
		}
	} else if (fiber.tag === 1) {
		// Class component: diff memoizedState object
		var ps = fiber.alternate ? fiber.alternate.memoizedState : tracking.prevState;
		var ns = fiber.memoizedState;
		if (ps && ns) {
			var stateKeys = Object.keys(ns);
			for (var s = 0; s < stateKeys.length; s++) {
				if (ps[stateKeys[s]] !== ns[stateKeys[s]]) {
					changes.push({
						key: 'state.' + stateKeys[s],
						prev: serialize(ps[stateKeys[s]]),
						next: serialize(ns[stateKeys[s]])
					});
				}
			}
		}
	}

	return changes.length > 0 ? changes : undefined;
}
```

### detectTriggerSource

Determines what caused the re-render by comparing the fiber against its alternate:

```typescript
function detectTriggerSource(fiber) {
	if (!fiber.alternate) return 'mount';

	var propsChanged = fiber.memoizedProps !== fiber.alternate.memoizedProps;
	var stateChanged = fiber.memoizedState !== fiber.alternate.memoizedState;

	// Check context
	var deps = fiber.dependencies || fiber.contextDependencies;
	var altDeps = fiber.alternate.dependencies || fiber.alternate.contextDependencies;
	var contextChanged = false;
	if (deps && deps.firstContext) {
		var ctx = deps.firstContext;
		while (ctx) {
			// If context value changed, this is a context-triggered update
			if (ctx.context && ctx.context._currentValue !== undefined) {
				contextChanged = true;
				break;
			}
			ctx = ctx.next;
		}
	}

	if (contextChanged) return 'context';
	if (stateChanged && !propsChanged) return 'state';
	if (propsChanged && !stateChanged) return 'props';
	if (propsChanged && stateChanged) return 'state'; // State change usually triggers prop cascade
	return 'parent'; // Parent re-rendered, passing same-value new-reference props
}
```

---

## Bug Pattern Detection

### Architecture

Pattern detection runs inline during `processCommit`, after a fiber is identified as changed. Each pattern detector is a function that takes the fiber and its tracking data and optionally queues an error event.

```typescript
function checkPatterns(fiber, tracking, componentName) {
	checkInfiniteRerender(fiber, tracking, componentName);
	checkStaleClosures(fiber, tracking, componentName);
	checkMissingCleanup(fiber, tracking, componentName);
	checkExcessiveContextRerender(fiber, tracking, componentName);
}
```

### Infinite Re-render Detection

```typescript
function checkInfiniteRerender(fiber, tracking, componentName) {
	var recentRenders = tracking.renderTimestamps.filter(function(t) {
		return Date.now() - t < INFINITE_RERENDER_WINDOW_MS;
	});

	if (recentRenders.length > INFINITE_RERENDER_THRESHOLD) {
		queueEvent('error', {
			framework: 'react',
			pattern: 'infinite_rerender',
			componentName: componentName,
			severity: 'high',
			detail: componentName + ' rendered ' + recentRenders.length +
				' times in ' + INFINITE_RERENDER_WINDOW_MS + 'ms. Likely setState in useEffect without proper deps.',
			evidence: {
				rendersInWindow: recentRenders.length,
				windowMs: INFINITE_RERENDER_WINDOW_MS,
				lastState: serialize(fiber.memoizedState)
			}
		});
	}
}
```

### Stale Closure Detection

```typescript
function checkStaleClosures(fiber, tracking, componentName) {
	// Only for function components
	if (fiber.tag !== 0 && fiber.tag !== 11 && fiber.tag !== 14 && fiber.tag !== 15) return;

	var hooks = getHooksState(fiber);
	for (var i = 0; i < hooks.length; i++) {
		var ms = hooks[i].hook.memoizedState;
		// Check effect and memo hooks that have deps
		if (ms && typeof ms === 'object' && 'deps' in ms && ms.deps !== null) {
			var prevDeps = tracking.prevDeps[i];
			if (prevDeps && shallowEqual(ms.deps, prevDeps)) {
				// Deps unchanged this render. Check how many renders they have been stale.
				if (!tracking._staleCount) tracking._staleCount = {};
				tracking._staleCount[i] = (tracking._staleCount[i] || 0) + 1;

				if (tracking._staleCount[i] >= STALE_CLOSURE_THRESHOLD) {
					// Check that state has actually changed (deps should have included it)
					var stateChanged = fiber.memoizedState !== fiber.alternate.memoizedState;
					if (stateChanged) {
						queueEvent('error', {
							framework: 'react',
							pattern: 'stale_closure',
							componentName: componentName,
							severity: 'medium',
							detail: 'Hook at index ' + i + ' in ' + componentName +
								' has unchanged deps for ' + tracking._staleCount[i] +
								' renders while state changed. Possible stale closure.',
							evidence: {
								hookIndex: i,
								unchangedDeps: serialize(ms.deps),
								rendersSinceLastDepsChange: tracking._staleCount[i],
								renderCount: tracking.renderCount
							}
						});
						tracking._staleCount[i] = 0; // Reset to avoid spamming
					}
				}
			} else {
				// Deps changed, reset counter
				if (tracking._staleCount) tracking._staleCount[i] = 0;
			}
		}

		// Also check [value, deps] tuples (useMemo/useCallback)
		if (Array.isArray(ms) && ms.length === 2 && (Array.isArray(ms[1]) || ms[1] === null) && ms[1] !== null) {
			var prevMemoDeps = tracking.prevDeps[i];
			if (prevMemoDeps && shallowEqual(ms[1], prevMemoDeps)) {
				if (!tracking._staleCount) tracking._staleCount = {};
				tracking._staleCount[i] = (tracking._staleCount[i] || 0) + 1;
				// Same threshold logic as above
			} else {
				if (tracking._staleCount) tracking._staleCount[i] = 0;
			}
		}
	}
}
```

### Missing Cleanup Detection

```typescript
function checkMissingCleanup(fiber, tracking, componentName) {
	if (fiber.tag !== 0 && fiber.tag !== 11) return;

	var hooks = getHooksState(fiber);
	for (var i = 0; i < hooks.length; i++) {
		var ms = hooks[i].hook.memoizedState;
		if (ms && typeof ms === 'object' && 'create' in ms && 'tag' in ms) {
			// This is an effect
			var isPassive = (ms.tag & 8) !== 0; // Passive = 0b1000
			if (isPassive && ms.destroy === undefined && tracking.renderCount > 1) {
				// Effect has no cleanup and component has re-rendered
				// Only warn if this effect was re-created (deps changed or no deps)
				var hasEffect = (ms.tag & 1) !== 0; // HasEffect = 0b0001
				if (hasEffect) {
					queueEvent('error', {
						framework: 'react',
						pattern: 'missing_cleanup',
						componentName: componentName,
						severity: 'low',
						detail: 'useEffect at index ' + i + ' in ' + componentName +
							' has no cleanup function but re-runs on re-render. ' +
							'If it sets up subscriptions or timers, this may cause leaks.',
						evidence: {
							hookIndex: i,
							effectTag: ms.tag,
							hasDestroyFn: false,
							renderCount: tracking.renderCount
						}
					});
				}
			}
		}
	}
}
```

### Excessive Context Re-render Detection

This pattern is checked at the ContextProvider level (tag 10), not at consumers:

```typescript
function checkExcessiveContextRerender(fiber, tracking, componentName) {
	if (fiber.tag !== 10) return; // ContextProvider only
	if (!fiber.alternate) return; // First mount

	if (fiber.memoizedProps.value === fiber.alternate.memoizedProps.value) return;

	// Context value changed. Count affected consumers in this subtree.
	var consumerCount = 0;
	var consumerNames = [];
	var stack = [fiber.child];

	while (stack.length > 0 && consumerCount <= CONTEXT_RERENDER_THRESHOLD + 5) {
		var f = stack.pop();
		if (!f) continue;

		// Check if this fiber consumes the context
		var deps = f.dependencies || f.contextDependencies;
		if (deps && deps.firstContext) {
			var ctx = deps.firstContext;
			while (ctx) {
				if (ctx.context === fiber.type._context) {
					consumerCount++;
					if (consumerNames.length < 10) {
						consumerNames.push(getComponentName(f));
					}
					break;
				}
				ctx = ctx.next;
			}
		}

		if (f.sibling) stack.push(f.sibling);
		if (f.child) stack.push(f.child);
	}

	if (consumerCount > CONTEXT_RERENDER_THRESHOLD) {
		queueEvent('error', {
			framework: 'react',
			pattern: 'excessive_context_rerender',
			componentName: componentName,
			severity: 'medium',
			detail: 'Context provider ' + componentName + ' value changed, causing ' +
				consumerCount + '+ consumers to re-render. Consider memoizing the value ' +
				'or splitting the context.',
			evidence: {
				contextDisplayName: componentName,
				affectedConsumerCount: consumerCount,
				consumerNames: consumerNames
			}
		});
	}
}
```

---

## Throttling Strategy

### requestAnimationFrame Batching

Events are not reported immediately. They are queued and flushed once per animation frame:

1. `queueEvent(type, data)` pushes to `eventQueue[]` and schedules a `requestAnimationFrame` callback if one is not already pending.
2. `flushEvents()` runs at the next frame. It computes a budget based on elapsed time and `MAX_EVENTS_PER_SECOND` (default 10).
3. Events are dequeued up to the budget and reported via `console.debug('__BL__', ...)`.
4. If events remain, another frame is scheduled.

This approach ensures:
- Multiple synchronous commits within a single frame are coalesced.
- The CDP console channel is not saturated during rapid updates.
- The observer never blocks the main thread longer than a single event serialization.

### Overflow Behavior

If the queue exceeds 100 events (e.g., during a render storm), older events are dropped. An overflow event is emitted:

```typescript
if (eventQueue.length > 100) {
	var dropped = eventQueue.length - 50;
	eventQueue = eventQueue.slice(-50); // Keep newest 50
	report('error', {
		framework: 'react',
		pattern: 'observer_overflow',
		componentName: '[Observer]',
		severity: 'low',
		detail: 'Dropped ' + dropped + ' framework events due to high commit rate.',
		evidence: { dropped: dropped }
	});
}
```

### Configurable Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxEventsPerSecond` | 10 | Rate limit for `__BL__` reports |
| `maxSerializationDepth` | 3 | How deep to serialize state/props values |
| `staleClosureThreshold` | 5 | Renders with unchanged deps before stale closure warning |
| `infiniteRerenderThreshold` | 15 | Renders in 1s window before infinite loop warning |
| `contextRerenderThreshold` | 20 | Consumer count before excessive context warning |

---

## Integration Point

### FrameworkTracker

`FrameworkTracker` is the orchestrator class, parallel to `InputTracker`. It manages framework observers and handles injection.

```typescript
// src/browser/recorder/framework/index.ts

export class FrameworkTracker {
	private config: FrameworkConfig;
	private reactObserver: ReactObserver | null = null;

	constructor(config: FrameworkConfig) {
		this.config = config;
	}

	/**
	 * Returns all injection scripts that should be added via
	 * Page.addScriptToEvaluateOnNewDocument.
	 */
	getInjectionScripts(): string[] {
		const scripts: string[] = [];
		const fw = this.config.frameworkState;

		if (!fw) return scripts;

		const frameworks = fw === true ? ["react", "vue", "solid", "svelte"] : fw;

		if (frameworks.includes("react") || frameworks.includes("auto")) {
			this.reactObserver = new ReactObserver(this.config.react ?? {});
			scripts.push(this.reactObserver.getInjectionScript());
		}
		// ... vue, solid, svelte observers similarly

		return scripts;
	}

	/**
	 * Process a __BL__ framework event from the console channel.
	 * Called by EventPipeline when it receives a framework_* type.
	 */
	processFrameworkEvent(
		eventData: { type: string; ts: number; data: Record<string, unknown> },
		tabId: string,
	): RecordedEvent | null {
		// Normalize into RecordedEvent format
		const type = eventData.type as EventType; // "framework_detect" | "framework_state" | "framework_error"
		return {
			id: crypto.randomUUID(),
			timestamp: eventData.ts,
			type,
			tabId,
			summary: this.buildSummary(eventData),
			data: eventData.data,
		};
	}
}
```

### EventPipeline Integration

The `EventPipeline.process()` method already handles `__BL__` messages from the console channel (used by `InputTracker`). Framework events flow through the same path:

```
Runtime.consoleAPICalled
  args[0].value === "__BL__"
    |
    v
  Parse args[1].value as JSON
    |
    +--- type starts with "framework_" ?
    |      |
    |      v
    |    FrameworkTracker.processFrameworkEvent()
    |      |
    |      v
    |    buffer.push(event)
    |    persistence.onNewEvent(event)
    |    autoDetector.check(event)
    |
    +--- type is "click" | "submit" | etc. ?
           |
           v
         InputTracker.processInputEvent() (existing path)
```

The `EventType` union in `src/browser/types.ts` must be extended:

```typescript
export type EventType =
	| "navigation"
	| "network_request"
	| "network_response"
	| "console"
	| "page_error"
	| "user_input"
	| "dom_mutation"
	| "form_state"
	| "screenshot"
	| "performance"
	| "websocket"
	| "storage_change"
	| "marker"
	// Framework state events
	| "framework_detect"
	| "framework_state"
	| "framework_error";
```

### BrowserRecorder Wiring

In `BrowserRecorder`, the `FrameworkTracker` is instantiated alongside `InputTracker` and its injection scripts are added during tab setup:

```typescript
// In BrowserRecorder constructor:
this.frameworkTracker = new FrameworkTracker(config.features ?? {});

// In tab setup (where addScriptToEvaluateOnNewDocument is called):
const frameworkScripts = this.frameworkTracker.getInjectionScripts();
for (const script of frameworkScripts) {
	await cdpClient.send(tabSessionId, "Page.addScriptToEvaluateOnNewDocument", {
		source: script,
	});
}
```

### Auto-Detection Rules

New detection rules for framework events are added to `auto-detect.ts`:

```typescript
const frameworkDetectionRules: DetectionRule[] = [
	{
		eventTypes: ["framework_error"],
		condition: (e) => e.data.severity === "high",
		label: (e) => `${e.data.pattern}: ${e.data.detail}`,
		severity: "high",
		cooldownMs: 5000,
	},
	{
		eventTypes: ["framework_error"],
		condition: (e) => e.data.severity === "medium",
		label: (e) => `${e.data.pattern}: ${e.data.componentName}`,
		severity: "medium",
		cooldownMs: 10000,
	},
];
```

These rules cause auto-markers to be placed when high-severity bug patterns (like infinite re-renders) are detected, making them visible in the session timeline alongside network errors and console exceptions.
