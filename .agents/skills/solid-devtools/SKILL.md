---
name: solid-devtools
description: "SolidJS debug interface reference. Use when implementing or debugging Solid state observation — DEV hooks, signal tracking, ownership tree, store observation. Tier 2: requires dev-mode builds."
---

# SolidJS Debug Internals

**No global hook.** Unlike React/Vue, Solid does not inject a `__DEVTOOLS_GLOBAL_HOOK__`. All debug APIs live on the `DEV` export from `solid-js`, available only in dev-mode builds (stripped in production).

## DEV Export

```typescript
import { DEV } from 'solid-js'

// DEV is undefined in production builds
if (DEV) {
  DEV.hooks  // debug hook registration
}
```

### DEV.hooks

| Hook | Fires when | Signature |
|------|-----------|-----------|
| `afterRegisterGraph` | Signal/memo/effect created | `(node: GraphNode) => void` |
| `afterCreateOwner` | Owner (component/effect scope) created | `(owner: Owner) => void` |
| `afterUpdate` | Any signal write triggers updates | `() => void` |

```typescript
DEV.hooks.afterRegisterGraph = (node) => {
  // node.name — debug name (if set)
  // node.value — current value
  // node.owner — parent owner
}

DEV.hooks.afterCreateOwner = (owner) => {
  // owner.name, owner.owner (parent), owner.owned (children)
}
```

## Store DevHooks

For `createStore` observation:

```typescript
import { DEV } from 'solid-js'

// Available on store internals
DEV.hooks.onStoreNodeUpdate = (state, property, value, prev) => {
  // Fires on every store property mutation
}
```

## Signal Observation Strategies

Solid signals have no global subscribe mechanism. Options ranked by granularity:

**1. afterUpdate (coarse)** — knows something changed, not what:
```typescript
DEV.hooks.afterUpdate = () => {
  // A signal was written and effects ran
}
```

**2. Wrap createSignal setters (fine-grained):**
```typescript
const originalCreateSignal = solid.createSignal
solid.createSignal = (value, options) => {
  const [get, set] = originalCreateSignal(value, options)
  const wrappedSet = (v) => {
    console.log('Signal update:', options?.name, v)
    return set(v)
  }
  return [get, wrappedSet]
}
```

**3. Monkey-patch DEV.writeSignal (comprehensive):**
```typescript
const origWrite = DEV.writeSignal
DEV.writeSignal = (node, value) => {
  console.log('Write:', node.name, value)
  return origWrite(node, value)
}
```

## Ownership Tree

The ownership tree represents component and effect hierarchy:

```typescript
import { getOwner } from 'solid-js'

const owner = getOwner()
// owner.owner       — parent (upward traversal)
// owner.owned       — children (downward traversal)
// owner.name        — debug name
// owner.context     — context values
// owner.cleanups    — cleanup functions
```

Component boundaries are inferred from owners — a component function runs within an owner scope. Without the solid-devtools Vite plugin, component names may be missing or minified.

## Component Name Resolution

Limited without tooling:
- **With solid-devtools Vite plugin:** Injects `name` properties into component owners at compile time
- **Without plugin:** Only `owner.name` if manually set, otherwise anonymous
- The plugin transform: `const Comp = () => ...` → attaches `"Comp"` to the owner

## Challenge: Accessing DEV from Bundled Apps

The `DEV` export is internal to the app's `solid-js` module instance. It is **not on `window`**. Strategies:

1. **Bridge script** — inject a script that imports `solid-js` from the same bundle and exposes `DEV` on `window`
2. **Module interception** — hook into the bundler to expose internals
3. **CDP evaluation** — if the app uses ESM, evaluate `import('solid-js').then(m => m.DEV)` via CDP (may fail with bundled code)

## Solid 2.0 / @solidjs/signals

The `@solidjs/signals` package may change hook shapes. The core reactive primitives are being extracted. Monitor for:
- New hook registration API
- Changes to `GraphNode` shape
- Possible global hook introduction

## Key Gotchas

- **Signal reads outside tracking scope** — reading a signal outside `createEffect`/`createMemo` won't track. DevTools must be careful not to trigger unintended tracking.
- **Destructured props** — `const { x } = props` breaks reactivity. Common bug pattern to detect: prop access outside of JSX or effect.
- **Store mutation bypassing setter** — direct mutation of store objects (without `produce`/`reconcile`) won't trigger updates. Detectable via `onStoreNodeUpdate` not firing for expected changes.
