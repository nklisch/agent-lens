# Framework State Capture — Approach

This document describes the overall approach for adding framework-aware state observation to Browser Lens. Per-framework details live in their own subdirectories.

---

## Goal

Surface framework-specific component state, reactivity, and bug patterns to the agent through the existing Browser Lens event pipeline. The agent should know *what framework* it's dealing with and receive state-change events that map to framework-specific debugging concepts (stale closures in React, lost reactivity in Vue, etc.).

## Design Principles

1. **Passive observation** — We never modify the app's behavior, only observe it.
2. **Auto-detection** — Framework detection is automatic. The injection script installs shims for all supported hooks before any app code loads. Whichever framework registers first wins.
3. **Same pipeline** — Framework events flow through the existing `__BL__` console.debug channel → `EventPipeline` → buffer → persistence → investigation tools. No new MCP tools needed.
4. **Config-gated** — Features are toggled at launch via a `features` config. Disabled features don't inject scripts, don't register hooks, don't generate events.
5. **Token-efficient** — Framework state is summarized, not dumped. Full state is available on-demand via `session_inspect`.
6. **Graceful degradation** — If no framework is detected, nothing changes. If a framework is detected but state capture fails, we log a warning and continue with DOM-level observation.

## Injection Timing

All framework hooks must be installed **before** the framework loads. Our existing `Page.addScriptToEvaluateOnNewDocument` pattern guarantees this — the injection runs before any `<script>` tag on the page.

```
Page.addScriptToEvaluateOnNewDocument
    ├─ framework-detector.js    (always — detect which framework loads)
    ├─ react-observer.js        (if features.frameworkState includes "react" or "auto")
    ├─ vue-observer.js          (if features.frameworkState includes "vue" or "auto")
    ├─ solid-observer.js        (if features.frameworkState includes "solid" or "auto")  [tier 2]
    └─ svelte-observer.js       (if features.frameworkState includes "svelte" or "auto") [tier 3]
```

## Event Types

New event types added to the `EventType` union:

| Type | Description |
|------|-------------|
| `framework_detect` | Framework identified — name, version, root count, component count |
| `framework_state` | Component state change — component name, changed values, render count |
| `framework_error` | Framework-specific bug pattern detected — stale closure, infinite loop, etc. |

## New `RecordedEvent.data` Shapes

### `framework_detect`
```typescript
{
  framework: "react" | "vue" | "solid" | "svelte",
  version: string,
  rootCount: number,
  componentCount: number,
  storeDetected?: string,  // "pinia" | "vuex" | "redux" | etc.
}
```

### `framework_state`
```typescript
{
  framework: string,
  componentName: string,
  componentPath?: string,       // e.g. "App > Layout > UserProfile"
  changeType: "mount" | "update" | "unmount" | "store_mutation",
  changes?: Array<{ key: string, prev: unknown, next: unknown }>,
  renderCount?: number,         // cumulative renders for this component
  triggerSource?: string,       // what caused the update (prop change, state, context, etc.)
}
```

### `framework_error`
```typescript
{
  framework: string,
  pattern: string,              // "stale_closure" | "infinite_rerender" | "lost_reactivity" | etc.
  componentName: string,
  severity: "low" | "medium" | "high",
  detail: string,               // human-readable explanation
  evidence: Record<string, unknown>,
}
```

## Config Schema

Extension to `chrome_start` parameters:

```typescript
{
  // ... existing params ...
  features?: {
    inputTracking?: boolean,        // default: true (existing)
    screenshots?: boolean,          // default: true (existing)
    frameworkState?: boolean | string[],  // default: false
    // true = auto-detect all supported frameworks
    // ["react"] = only install React observer
    // ["react", "vue"] = install both
  }
}
```

## Auto-Detection Rules

New entries for `auto-detect.ts`:

| Pattern | Severity | Description |
|---------|----------|-------------|
| Same component commits >15 times in 1s | high | Infinite re-render loop (React) |
| Component updated >30 times in 2s | high | Infinite re-render / watcher loop (Vue) |
| `useCallback`/`useMemo` deps unchanged across state changes | medium | Stale closure suspected (React) |
| Destructured reactive prop detected | medium | Lost reactivity (Vue/Solid) |
| Error boundary activated | medium | Caught error in component tree (React) |
| Effect cleanup missing for subscription effect | low | Potential memory leak (React) |

## Implementation Order

### Phase 1: React + Vue (Tier 1)
1. `FrameworkTracker` class (parallel to `InputTracker`)
2. React observer — hook shim, fiber walking, commit tracking, bug detection
3. Vue observer — hook shim, component tree, reactivity tracking, store integration
4. Integration into `EventPipeline`
5. Config gating in `BrowserRecorder`
6. Tests with real React/Vue apps in fixtures

### Phase 2: Solid (Tier 2)
7. Solid observer — DEV hooks, signal tracking, ownership tree
8. Requires dev-mode builds; document limitation

### Phase 3: Svelte (Tier 3)
9. Svelte 4 observer — `$$invalidate` patching, `$capture_state()`
10. Svelte 5 — wait for issue #11389 (devtools hooks API) or fall back to MutationObserver + heuristics

## Architecture

```
src/browser/
  recorder/
    framework/                    # NEW
      index.ts                    # FrameworkTracker orchestrator
      detector.ts                 # Auto-detect which framework loaded
      react-observer.ts           # React fiber hook + state extraction
      vue-observer.ts             # Vue devtools hook + reactivity tracking
      solid-observer.ts           # Solid DEV hooks (tier 2)
      svelte-observer.ts          # Svelte component tracking (tier 3)
      patterns/                   # Bug pattern detectors per framework
        react-patterns.ts
        vue-patterns.ts
        solid-patterns.ts
        svelte-patterns.ts
```

## Per-Framework Documentation

Each framework has its own subdirectory with three docs:

- `SPEC.md` — Formal contracts: hook shapes, event data schemas, detection criteria
- `INTERFACE.md` — The framework's internal debugging API surface (what we hook into)
- `ARCH.md` — Implementation architecture: injection scripts, observation strategy, extraction patterns

See:
- [React](./react/)
- [Vue](./vue/)
- [Solid](./solid/)
- [Svelte](./svelte/)
