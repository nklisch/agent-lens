---
name: vue-devtools
description: "Vue DevTools hook internals reference. Use when implementing or debugging Vue state observation — component tree walking, reactivity tracking, store integration, bug pattern detection."
---

# Vue DevTools Hook Internals

## __VUE_DEVTOOLS_GLOBAL_HOOK__

Event emitter injected by DevTools extension before Vue loads.

```typescript
interface VueDevToolsHook {
  on(event: string, handler: Function)
  once(event: string, handler: Function)
  off(event: string, handler: Function)
  emit(event: string, ...args: any[])
  enabled: boolean                        // set true when devtools connect
  apps: Set<App>                          // Vue 3 app instances
  appRecords: AppRecord[]                 // metadata per app
  Buffer: any[]                           // buffered events before connection
}
```

**Registration flow:** Vue emits `app:init` on the hook during `createApp().mount()` → hook records the app → sets `hook.enabled = true`.

## Key Events

| Event | Payload | When |
|-------|---------|------|
| `app:init` | `(app, version, types)` | App mounts |
| `component:added` | `(app, uid, parentUid, instance)` | Component created |
| `component:updated` | `(app, uid, parentUid, instance)` | Component re-rendered |
| `component:removed` | `(app, uid, parentUid, instance)` | Component destroyed |
| `component:emit` | `(app, instance, event, params)` | $emit called |

## Vue 3 Tree Walking

Components are linked via VNode subtrees:

```typescript
function walkTree(instance) {
  visit(instance)
  // instance.subTree is the root VNode of this component's render
  const subTree = instance.subTree
  if (subTree) walkVNode(subTree)
}

function walkVNode(vnode) {
  // If VNode has a component, it's a child component
  if (vnode.component) {
    walkTree(vnode.component)
  }
  // Array children (v-for, fragments)
  if (Array.isArray(vnode.children)) {
    vnode.children.forEach(child => {
      if (typeof child === 'object') walkVNode(child)
    })
  }
}
```

## Vue 2 Tree Walking

```typescript
function walkTree(vm) {
  visit(vm)
  vm.$children.forEach(child => walkTree(child))
}

// DOM → instance
const instance = element.__vue__
// Parent
const parent = vm.$parent
```

## State Extraction

### Vue 3

```typescript
const state = {
  props: instance.props,             // reactive props
  setupState: instance.setupState,   // ref/reactive from setup()
  data: instance.data,               // Options API data()
  computed: /* accessed via setupState for Composition API */
  provides: instance.provides,       // provide/inject values
}

// Component name
const name = instance.type.name
  || instance.type.__name           // SFC auto-inferred name
  || instance.type.__file           // fallback to filename
```

### Vue 2

```typescript
const state = {
  data: vm.$data,                    // reactive data
  props: vm.$props,                  // props
  computed: Object.keys(vm._computedWatchers || {}),
  watchers: vm._watchers,           // watcher instances
}

const name = vm.$options.name || vm.$options._componentTag
```

## Reactivity Debugging (Vue 3, dev-mode only)

```typescript
import { watch, ref } from 'vue'

// onTrack/onTrigger — only in dev mode builds
watch(someRef, (val) => { /* ... */ }, {
  onTrack(e) {
    // e.type: 'get' | 'has' | 'iterate'
    // e.target, e.key — what was accessed
  },
  onTrigger(e) {
    // e.type: 'set' | 'add' | 'delete' | 'clear'
    // e.target, e.key, e.newValue, e.oldValue
  },
})
```

For external observation without source modification, use `watch()` or `effect()` on exposed reactive state.

## Store Access

### Pinia

```typescript
import { getActivePinia } from 'pinia'

// All stores
const pinia = getActivePinia()
const stores = pinia._s  // Map<string, Store>

// Subscribe to mutations
store.$subscribe((mutation, state) => {
  // mutation.type: 'direct' | 'patch object' | 'patch function'
  // mutation.storeId, mutation.events
})

// Subscribe to actions
store.$onAction(({ name, store, args, after, onError }) => {
  after((result) => { /* action completed */ })
  onError((error) => { /* action threw */ })
})
```

### Vuex (Vue 2/3)

```typescript
store.subscribe((mutation, state) => {
  // mutation.type — e.g. 'cart/addItem'
  // mutation.payload
})

store.subscribeAction({
  before(action, state) { },
  after(action, state) { },
})
```

## DOM Lookups

```typescript
// Vue 3 — app instance on root element
const app = element.__vue_app__
const instance = element.__vueParentComponent

// Vue 2 — component instance
const vm = element.__vue__
```

## Buffer/Replay Mechanism

The hook buffers events for ~3 seconds before devtools connects. On connection:

```typescript
// DevTools replays buffered events
hook.Buffer.forEach(({ event, args }) => {
  processEvent(event, ...args)
})
hook.Buffer.length = 0
```

This means components mounted before devtools connects are still captured.

## Performance Guidelines

- **Lazy serialization** — only serialize component state when inspector panel opens, not on every update
- **Throttle updates** — batch `component:updated` events, process at most once per frame
- **Bounded buffers** — cap the event buffer to prevent memory leaks in long-running apps
- **Skip internal components** — filter out `<KeepAlive>`, `<Transition>`, `<RouterView>` from tree displays unless requested
