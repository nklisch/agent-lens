# Scenario Progression Design

Escalating debugging scenarios for the agent test harness. The difficulty ramp is designed so that **Level 1 already requires effort** and higher levels genuinely demand runtime debugging to solve in reasonable time.

See [scenario-guidelines.md](scenario-guidelines.md) for the full level definitions, design rules, and scenario anatomy checklist.

## Design Principles

1. **No freebies.** Every scenario should require the agent to read multiple files and reason about data flow. If the agent can fix it from a single file read, it's too easy.
2. **Higher levels = more bugs.** L1 has 1 bug. L2 has 2 interacting bugs. L3+ has 2-3+ scattered bugs. L6 has 4-5.
3. **Higher levels = more code.** L1 is ~200-300 lines. L6 is ~2500-4000 lines. The agent can't hold the full context.
4. **Debugger advantage must exist.** At every level, an agent with debugging tools should solve the problem faster or more reliably than one without. At L4+, solving without debugging should be near-impossible.
5. **Realistic code.** No toy examples. Code should look like it came from a real project.

## Current Scenario Inventory

### Level 1 — Subtle Single Bug (2-4 files, ~200-300 lines)

Surviving scenarios from the original suite. Claude solved them all without debugging tools (95%+ baseline pass rate). They're now L1 — the floor.

| Scenario | Language | Bug Pattern |
|----------|----------|-------------|
| `node-float-accumulation` | node | Float precision in bill splitting |
| `node-regex-lastindex` | node | RegExp lastIndex statefulness |
| `python-class-attribute-shared` | python | Class vs instance mutable attribute |
| `python-deep-pipeline` | python | SKU normalization mismatch in multi-stage pipeline |
| `python-encrypted-config` | python | Config merge order with runtime transforms |
| `python-float-accumulation` | python | Float precision in bill splitting |
| `ts-float-accumulation` | typescript | Float precision in bill splitting |
| `ts-generic-constraint` | typescript | Generic constraint mismatch |
| `ts-mapped-type-pipeline` | typescript | Mapped type key mismatch in event pipeline |
| `ts-runtime-registry` | typescript | Runtime service registry resolution |

### Level 2 — Two Interacting Bugs (4-6 files, ~400-600 lines)

| Scenario | Language | Bug Pattern |
|----------|----------|-------------|
| `python-billing-calc` | python | Tier boundary `<` vs `<=` + missing sub-feature aggregation |
| `node-data-pipeline` | node | DD/MM date parsing + comma truncation in parseFloat |
| `ts-access-control` | typescript | Incomplete role chain traversal + shallow permission merge |

### Level 3 — Multi-Bug Realistic Codebase (6-8 files, ~600-1000 lines)

| Scenario | Language | Bug Pattern |
|----------|----------|-------------|
| `python-course-grades` | python | Drop-highest vs drop-lowest, abs() penalizes early, grade boundary `>` vs `>=` |
| `node-expense-tracker` | node | Year-ignoring month filter, refunds added not subtracted, category whitespace |
| `ts-payroll` | typescript | Flat-rate vs progressive tax, PTO as overtime, pre-tax double-deduction |

### Level 4 — Large Codebase, Deep Investigation (8-12 files, ~1000-1500 lines)

| Scenario | Language | Bug Pattern |
|----------|----------|-------------|
| `node-hotel-reservations` | node | String resortFee in encoded config, group/loyalty discount overwrite, tax on pre-discount subtotal |
| `python-billing-calc` | python | *(designed, pending)* |

### Level 5 — Multiple Bugs, Runtime-Only Discovery (10-15 files, ~1500-2500 lines)

| Scenario | Language | Bug Pattern |
|----------|----------|-------------|
| `node-ecommerce-checkout` | node | Lexicographic volume tier sort, coupon checks pre-bundle subtotal, async inventory race, for...in prototype pollution |

### Level 6 — Adversarial, Multi-System (15-25 files, ~2500-4000 lines)

| Scenario | Language | Bug Pattern |
|----------|----------|-------------|
| `node-event-ticketing` | node | Shallow config merge, ghost lazy-getter bug, early-bird decimal/percent mismatch, fee on wrong price field, Array.flat() depth for VIP sections |

### Level 7 — Cross-Language (25-40 files, ~4000-7000 lines, 2-3 languages)

See [multi-language-scenarios.md](multi-language-scenarios.md) for full design.

| Scenario | Languages | Bug Pattern |
|----------|-----------|-------------|
| `multi-order-pipeline` | python+node+go | String weight across JSON boundary, discount fraction vs dollar interpretation, concurrent response ordering, pagination filter loss, price cache ignores quantity, Content-Type mismatch |
