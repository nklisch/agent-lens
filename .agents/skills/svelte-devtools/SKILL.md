---
name: svelte-devtools
description: "Svelte debug interface reference. Use when implementing or debugging Svelte state observation — $$invalidate, $capture_state, runes runtime. Tier 3: Svelte 4 doable, Svelte 5 hooks pending."
---

# Svelte Debug Internals

**No global hook.** Detection relies on DOM markers and component internals.

## Detection

```typescript
// Svelte component on DOM element
const isSvelte = element.__svelte !== undefined   // Svelte 4 (dev mode)
  || element.$$  !== undefined                     // Svelte 4 (component internals)

// Version detection
function getSvelteVersion(element) {
  if (element.__svelte_meta) return 4       // Svelte 4 dev metadata
  if (element.__svelte?.v) return 5         // Svelte 5 markers
  if (element.$$) return 4                  // Svelte 4 component
  return null
}
```

## Svelte 4

### Component Internals ($$)

Every Svelte 4 component instance has a `$$` property:

```typescript
const $$ = component.$$
// $$.ctx        — state array (all let bindings, props, derived values)
// $$.dirty      — bitmask indicating which ctx indices changed
// $$.callbacks  — event handler maps
// $$.fragment   — the compiled DOM fragment
// $$.on_mount   — onMount callbacks
// $$.on_destroy — onDestroy callbacks
```

### State Access

State lives in `$$.ctx` as a flat array. Index positions are compiler-determined:

```typescript
// $$.ctx[0] might be `count`, $$.ctx[1] might be `name`, etc.
// Indices are stable per component but not discoverable without source maps
```

### $$invalidate

The core update mechanism. Called when state changes:

```typescript
// $$invalidate(index, newValue) — marks ctx[index] dirty and schedules update
// Monkey-patch to observe all state changes:
const origInvalidate = component.$$.ctx[/* $$invalidate index */]
// Better approach: wrap at the component prototype level
```

### Dev Mode APIs ($capture_state / $inject_state)

Available when compiled with `dev: true`:

```typescript
// Returns state as a plain object (variable names as keys)
const state = component.$capture_state()
// { count: 5, name: "hello", doubled: 10 }

// Inject new state values
component.$inject_state({ count: 10 })
```

These are the cleanest observation APIs for Svelte 4.

### Observation Approach

Wrap component initialization to intercept `$$invalidate`:

```typescript
// Monkey-patch SvelteComponent or the init() function
const origInit = svelte.init
svelte.init = (component, options, instance, ...) => {
  origInit(component, options, (...args) => {
    const $$ = instance(...args)
    // Wrap $$invalidate here
    return $$
  }, ...)
}
```

## Svelte 5 (Runes)

### Runtime Model

Runes compile to internal runtime calls — fundamentally different from Svelte 4:

```typescript
// Source:           let count = $state(0)
// Compiles to:      let count = $.source(0)

// Source:           let doubled = $derived(count * 2)
// Compiles to:      let doubled = $.derived(() => $.get(count) * 2)

// Reads:            $.get(signal)
// Writes:           $.set(signal, value)
```

### $inspect() — Built-in Debug Rune

```typescript
// Only works in source code — cannot be injected via CDP
$inspect(count)           // logs on change
$inspect(count).with(fn)  // custom handler
```

Limitation: `$inspect()` is a compile-time rune. It must appear in component source. Cannot be dynamically injected into running applications.

### DevTools Status: BROKEN

Svelte 5 shipped without external devtools hooks. **Issue #11389** tracks adding proper instrumentation. Current state:

- No equivalent to `$capture_state` / `$inject_state`
- Internal signals (`$.source`) are not exposed
- No component lifecycle hooks for external consumers
- The svelte-devtools extension does not work with Svelte 5

### Svelte 5 Fallback

Until hooks ship, the only external observation strategy:

```typescript
// MutationObserver on the DOM — detect text/attribute changes
const observer = new MutationObserver((mutations) => {
  // Infer state changes from DOM updates
  // Very coarse — no variable names, no component boundaries
})
observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
```

## Version Detection Strategy

Branch observer implementation based on runtime:

```typescript
function createSvelteObserver(element) {
  const version = getSvelteVersion(element)
  if (version === 4) return new Svelte4Observer(element)  // $capture_state, $$invalidate wrapping
  if (version === 5) return new Svelte5Observer(element)  // MutationObserver fallback only
  return null
}
```

## Key Gotchas

| Issue | Version | Description |
|-------|---------|-------------|
| Mutation vs assignment | Svelte 4 | `array.push(x)` won't trigger — must reassign: `array = [...array, x]` |
| `$derived` not proxied | Svelte 5 | Derived values are read-only, cannot be intercepted at the setter level |
| Class instances not proxied | Svelte 5 | `$state` on class fields uses proxies, but nested class instances may not be deeply reactive |
| Compiler-dependent indices | Svelte 4 | `$$.ctx` array indices depend on compilation — not stable across builds |
| Dev-only APIs | Svelte 4 | `$capture_state` / `$inject_state` stripped in production builds |
