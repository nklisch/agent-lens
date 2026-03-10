# Solid Observer — Specification

This document defines the formal contracts, detection criteria, event schemas, and bug pattern definitions for Solid state observation via Chrome DevTools Protocol injection.

> **Tier 2 target.** Solid observation requires dev-mode builds. All `DEV` hooks are stripped in production by the Solid compiler. There is no runtime fallback for signal-level observation in production builds.

---

## Detection Criteria

Solid has no global hook equivalent to React's `__REACT_DEVTOOLS_GLOBAL_HOOK__` or Vue's `__VUE_DEVTOOLS_GLOBAL_HOOK__`. Detection relies on a combination of heuristics:

| Strategy | Reliability | Notes |
|----------|-------------|-------|
| `window._$SOLID` marker | High | Set by solid-devtools when installed. Not present in vanilla apps. |
| `DEV` export accessible | High | Only exists in dev builds. Confirms Solid + dev mode. |
| `data-hk` attributes in DOM | Medium | Hydration markers from SolidStart SSR. Not present in client-only apps. |
| `_$owner` on DOM nodes | Medium | Solid attaches ownership references in dev mode. |
| Module interception of `solid-js` | High | Monkey-patching the module loader to intercept `createSignal` imports. Requires injection before app loads. |

Detection emits a `framework_detect` event. If `DEV` is not accessible (production build), the event includes a `devMode: false` flag and a warning. Signal-level observation is not available in this case.

---

## DEV Hooks Contract

Solid exposes a `DEV` named export from `solid-js` in development builds. This object provides lifecycle hooks for tooling.

### DEV Shape (Solid 1.x)

```typescript
/** Exported from "solid-js" in dev builds only. Undefined in production. */
interface SolidDEV {
  /** Registry of all created computations, keyed by internal ID */
  readonly registry: Map<number, Owner>;

  hooks: DevHooks;

  /** Write to a signal — internal, used by setters */
  writeSignal(node: SignalState<unknown>, value: unknown): void;
}

interface DevHooks {
  /** Called after every signal, memo, or effect is registered in the reactive graph */
  afterRegisterGraph?(node: { name?: string; value?: unknown }): void;

  /** Called after every reactive update cycle completes */
  afterUpdate?(): void;

  /** Called when a new Owner (computation scope) is created */
  afterCreateOwner?(owner: Owner): void;

  /** Called after createSignal (Solid 1.8+) */
  afterCreateSignal?(signal: SignalState<unknown>): void;
}
```

### Store DevHooks

```typescript
/** Available on store proxy nodes in dev mode */
interface StoreDevHooks {
  /** Called on every store property mutation */
  onStoreNodeUpdate(
    state: StoreNode,
    property: string,
    value: unknown,
    prev: unknown
  ): void;
}
```

> **Unstable.** Store DevHooks are internal to `solid-js/store` and not part of the public API. The callback signature has changed between minor versions.

---

## Signal Structure (Dev Mode)

In dev builds, each signal created by `createSignal` has internal state accessible via the `SignalState` shape:

```typescript
interface SignalState<T> {
  /** Debug name, if provided via options: createSignal(0, { name: "count" }) */
  name?: string;

  /** Current value of the signal */
  value: T;

  /** Set of computations (effects/memos) that read this signal */
  observers: Set<Computation> | null;

  /** Set of computations that this node depends on (for memos) */
  sources: Set<SignalState<unknown>> | null;

  /** Number of times this signal has been written to */
  tValue?: T;  // transition value, internal
}
```

Signals without explicit `name` option receive auto-generated names in dev mode (e.g., `"signal-0"`, `"signal-1"`). The solid-devtools Babel plugin enriches these with source-level names.

---

## Owner / Computation Tree

Solid's reactivity is organized into an ownership tree. Every computation (effect, memo, component render) creates an `Owner` that tracks its children.

```typescript
interface Owner {
  /** Parent owner — null for root */
  owner: Owner | null;

  /** Child owners (effects, memos, nested components) */
  owned: Owner[] | null;

  /** Cleanup functions registered via onCleanup() */
  cleanups: (() => void)[] | null;

  /** The reactive context — what this owner computes */
  context: Record<symbol, unknown> | null;

  /** Component name, if this owner is a component boundary */
  name?: string;

  /** Source location (file:line:col), only with Babel plugin */
  sourceMap?: {
    file: string;
    line: number;
    column: number;
  };
}
```

Component boundaries in the owner tree are identified by owners that have a `name` property matching a component function name. Without the solid-devtools Babel plugin, names may be minified or absent.

---

## Event Data Schemas

These extend the base schemas defined in [APPROACH.md](../APPROACH.md).

### `framework_detect` (Solid-specific)

```typescript
{
  framework: "solid",
  version: string,             // e.g., "1.8.7"
  rootCount: number,           // number of render() calls detected
  componentCount: number,      // owners with component names in the tree
  devMode: boolean,            // true if DEV export is accessible
  storeDetected?: "solid-store",  // if createStore usage detected
  warning?: string,            // e.g., "Production build — signal observation unavailable"
}
```

### `framework_state` (Solid-specific)

```typescript
{
  framework: "solid",
  componentName: string,       // owner name or "Anonymous"
  componentPath?: string,      // "App > Layout > Counter"
  changeType: "mount" | "update" | "unmount" | "store_mutation" | "signal_write",
  changes?: Array<{
    key: string,               // signal name or store property path
    prev: unknown,
    next: unknown,
  }>,
  signalCount?: number,        // signals owned by this component
  triggerSource?: string,      // "signal_write" | "store_mutation" | "prop_change"
}
```

### `framework_error` (Solid-specific)

```typescript
{
  framework: "solid",
  pattern: SolidBugPattern,
  componentName: string,
  severity: "low" | "medium" | "high",
  detail: string,
  evidence: Record<string, unknown>,
}

type SolidBugPattern =
  | "untracked_signal_read"     // signal accessed outside tracking scope
  | "destructured_props"        // eagerly-read prop values lose reactivity
  | "missing_memo"              // derived state recomputed without memo
  | "store_direct_mutation"     // store mutated without setter (bypassing proxy)
  | "missing_cleanup"           // effect with subscriptions but no onCleanup
  | "excessive_signal_writes";  // > N signal writes in a single update cycle
```

---

## Bug Pattern Definitions

### `untracked_signal_read`

**Severity:** medium

A signal is read (getter called) outside of any reactive tracking scope. The read returns the current value but will never trigger re-execution when the signal changes. This is the Solid equivalent of a stale closure.

**Detection:** After `afterRegisterGraph`, track signals. If a signal's `observers` set remains empty after its first read (detected via wrapped getter), flag it. Exclude signals read inside `untrack()` calls (intentional).

**Evidence:** `{ signalName, readLocation, trackingScopeActive: false }`

### `destructured_props`

**Severity:** medium

Component props are destructured in the function signature or at the top of the component body. In Solid, props are a Proxy — destructuring eagerly reads all values and breaks reactivity.

```typescript
// BUG: props.name is read eagerly, will never update
function Greeting({ name }: { name: string }) {
  return <h1>Hello {name}</h1>;
}

// CORRECT: access props.name lazily
function Greeting(props: { name: string }) {
  return <h1>Hello {props.name}</h1>;
}
```

**Detection:** If a component's props object has multiple properties read during the initial computation (mount) but the component never re-runs when parent updates, flag it. This is heuristic and may produce false positives.

**Evidence:** `{ componentName, propsReadDuringMount: string[], subsequentUpdates: 0 }`

### `missing_memo`

**Severity:** low

A derived computation is performed inline in JSX or in an effect body without `createMemo`. In Solid, this means the computation re-runs on every signal change that triggers the enclosing scope, even if the inputs to the derivation haven't changed.

**Detection:** Track computations that read multiple signals but are not memos. If an effect or component re-runs due to signal A but also reads signal B (unchanged), the derivation from B should likely be a memo.

**Evidence:** `{ computationName, signalsRead: string[], unchangedSignals: string[] }`

### `store_direct_mutation`

**Severity:** high

A store object is mutated directly (e.g., `state.count++`) instead of through the setter function returned by `createStore`. Direct mutations bypass the proxy and do not trigger reactive updates.

**Detection:** `onStoreNodeUpdate` will NOT fire for direct mutations — that is the point. Detection requires wrapping the store proxy's get trap to detect property access patterns consistent with mutation (get followed by no corresponding set). This is unreliable; primarily detected via the `store_direct_mutation` pattern when the agent reports "state didn't update."

**Evidence:** `{ storePath, mutationType: "direct_assignment" | "array_push" | "delete" }`

### `missing_cleanup`

**Severity:** low

An effect (`createEffect`) registers external subscriptions (event listeners, intervals, WebSocket connections) but does not call `onCleanup()` to dispose them when the effect re-runs or the owner is disposed.

**Detection:** Heuristic — if an effect's computation body calls `addEventListener`, `setInterval`, `setTimeout`, `subscribe`, or similar, and the owner has no cleanups registered, flag it.

**Evidence:** `{ effectName, subscribeLikeCalls: string[], cleanupCount: 0 }`

---

## Solid 1.x vs 2.0

Solid 2.0 (in development, based on `@solidjs/signals`) restructures the reactive primitives. Key differences relevant to observation:

| Aspect | Solid 1.x | Solid 2.0 (expected) |
|--------|-----------|---------------------|
| Reactive core | Built into `solid-js` | Extracted to `@solidjs/signals` |
| `DEV` export | `solid-js` | `@solidjs/signals` (TBD) |
| DevHooks shape | `afterRegisterGraph`, `afterUpdate`, `afterCreateOwner` | May change — hooks API not finalized |
| Signal internals | `SignalState` with `observers` Set | New `Signal` class with different shape |
| Owner tree | `Owner` with `owned` array | Likely similar but not guaranteed |

> **Unstable.** Solid 2.0 hook shapes are not finalized. The observer implementation should version-detect and adapt. Initially, only Solid 1.x (1.7+) is supported.

---

## Production Limitation

All `DEV` exports and hooks are compiled out in production Solid builds. This is enforced by the Solid compiler (via Babel plugin `babel-preset-solid`) which replaces:

```javascript
// Dev build
import { DEV } from "solid-js";
if (DEV) { /* hooks available */ }

// Production build — DEV is replaced with undefined, dead code eliminated
```

There is no runtime flag to re-enable dev hooks in production. Solid observation **requires** the application to be built in dev mode. This must be clearly communicated to the user when framework detection finds Solid but cannot access `DEV`.
