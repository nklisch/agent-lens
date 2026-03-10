---
name: react-devtools
description: "React DevTools hook internals reference. Use when implementing or debugging React state observation — fiber tree traversal, hook linked lists, onCommitFiberRoot, state extraction, bug pattern detection."
---

# React DevTools Hook Internals

## __REACT_DEVTOOLS_GLOBAL_HOOK__

Injected by DevTools extension before React loads. React checks for it on mount.

```typescript
interface DevToolsHook {
  supportsFiber: boolean
  inject(renderer: Renderer): number        // React calls this on init, returns rendererID
  onCommitFiberRoot(rendererID, fiberRoot, priorityLevel?)  // fires after every commit
  onCommitFiberUnmount(rendererID, fiber)
  on(event, handler)                        // event emitter
  emit(event, ...args)
  renderers: Map<number, Renderer>          // registered React instances
}
```

**Registration flow:** React calls `hook.inject(internals)` → hook stores renderer → returns ID used in all subsequent calls.

## onCommitFiberRoot

Fires after React commits updates to the DOM. This is the primary observation point.

```typescript
hook.onCommitFiberRoot = (rendererID, fiberRoot) => {
  const current = fiberRoot.current  // root Fiber of the committed tree
  walkFiber(current)
}
```

## Fiber Traversal

Fibers form a tree via three pointers — depth-first walk:

```typescript
function walkFiber(fiber: Fiber) {
  visit(fiber)
  if (fiber.child) walkFiber(fiber.child)
  if (fiber.sibling) walkFiber(fiber.sibling)
  // fiber.return = parent (for upward traversal)
}
```

### Component Name Extraction

```typescript
function getName(fiber: Fiber): string | null {
  const type = fiber.type
  if (!type) return null
  return type.displayName || type.name || null
}
```

## WorkTag Values (fiber.tag)

| Tag | Meaning |
|-----|---------|
| 0 | FunctionComponent |
| 1 | ClassComponent |
| 2 | IndeterminateComponent |
| 3 | HostRoot |
| 5 | HostComponent (div, span, etc.) |
| 6 | HostText |
| 7 | Fragment |
| 11 | ForwardRef |
| 13 | SuspenseComponent |
| 15 | SimpleMemoComponent |
| 16 | LazyComponent |

## Hook State (useState, useReducer, etc.)

Hooks are stored as a linked list on `fiber.memoizedState`:

```typescript
function extractHooks(fiber: Fiber) {
  const hooks = []
  let hook = fiber.memoizedState
  while (hook !== null) {
    hooks.push({
      memoizedState: hook.memoizedState,  // current value for useState
      queue: hook.queue,                   // dispatch queue for useState/useReducer
      next: hook.next,                     // next hook in chain
    })
    hook = hook.next
  }
  return hooks
}
```

**Identifying hook types by shape:**
- `useState/useReducer`: `hook.queue !== null` with `queue.dispatch`
- `useEffect/useLayoutEffect`: `hook.memoizedState` has `{ tag, create, destroy, deps }`
- `useRef`: `hook.memoizedState` is `{ current: value }`
- `useMemo`: `hook.memoizedState` is `[value, deps]`

## Detecting Changes

Compare current fiber to its previous version via `fiber.alternate`:

```typescript
function hasChanged(fiber: Fiber): boolean {
  if (!fiber.alternate) return true  // new mount
  return fiber.memoizedState !== fiber.alternate.memoizedState
    || fiber.memoizedProps !== fiber.alternate.memoizedProps
}
```

**Flags bitmask** (`fiber.flags`): `Placement = 2`, `Update = 4`, `Deletion = 8`, `ChildDeletion = 16`.

## Error Boundary Detection

```typescript
function isErrorBoundary(fiber: Fiber): boolean {
  return fiber.tag === 1  // ClassComponent
    && (typeof fiber.type.getDerivedStateFromError === 'function'
     || typeof fiber.stateNode.componentDidCatch === 'function')
}
```

## DOM → Fiber Lookup

React attaches fiber references to DOM nodes:

```typescript
// React 18+
const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
const fiber = el[fiberKey]

// React 16-17
const legacyKey = Object.keys(el).find(k => k.startsWith('__reactInternalInstance$'))
const fiber = el[legacyKey]
```

## Performance Guidelines

- **Throttle** `onCommitFiberRoot` — React can commit many times per frame during transitions
- **Lazy state extraction** — only walk hooks/props when a specific component is inspected
- **Avoid full tree walks** on every commit — track changed subtrees via `fiberRoot.current.alternate`
- **Bound recursion depth** for deeply nested trees

## bippy Library

[bippy](https://github.com/nicksrandall/bippy) provides utilities for React fiber instrumentation:

```typescript
import { instrument, traverseFiber, traverseState } from 'bippy'

// Instrument React with callbacks
instrument({
  onCommitFiberRoot(rendererID, fiberRoot) { /* ... */ },
  onCommitFiberUnmount(rendererID, fiber) { /* ... */ },
})

// Walk fiber tree
traverseFiber(rootFiber, (fiber) => {
  // return false to skip subtree
})

// Walk hook state
traverseState(fiber, (hook, index) => {
  console.log(`Hook ${index}:`, hook.memoizedState)
})
```
