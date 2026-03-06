# Design: Multi-Language Scenarios (Level 7)

Capstone debugging scenarios where bugs live at the boundaries between services written in different languages. The agent must debug across runtimes, trace data through HTTP boundaries, and reason about cross-service contracts that no single debugger session can fully observe.

## What L7 tests that L6 doesn't

L6 is "hardest single-language debugging" — adversarial misdirection, ghost bugs, deep data flows, all within one runtime. L7 adds a qualitatively different dimension: **cross-runtime debugging**, where the bug exists in the gap between systems.

A cross-boundary bug cannot be found by reading any single codebase exhaustively. Both services do something reasonable for their language. The interaction produces wrong results because they disagree on a data contract, type representation, or protocol assumption. The agent must hold two runtime mental models simultaneously.

### Distinguishing characteristics

| Dimension | L6 | L7 |
|-----------|----|----|
| Languages | 1 | 2-3 |
| Services | 1 process | 2-3 communicating processes |
| Files | 15-25 | 25-40 (across languages) |
| Lines | 2500-4000 | 4000-7000 |
| Bugs | 4-5 | 5-7 |
| Cross-boundary bugs | 0 | 3+ (the defining feature) |
| Debug sessions needed | 1 | 2-3 (one per language/service) |
| Timeout | 900s | 1500s |

### Cross-boundary bug patterns

These are the L7-specific bug types that can't exist in single-language scenarios:

1. **Type mismatch at serialization boundary** — One service sends a value as one JSON type (string vs number, int vs float), the other service's deserializer handles it differently. Neither code has a bug in isolation.

2. **Data contract disagreement** — Services use the same field name but interpret the value differently (percentage as 0.15 vs 15, date as DD/MM vs MM/DD, discount as fraction vs dollar amount).

3. **Protocol-level misunderstanding** — Content-Type mismatch, URL encoding differences, pagination link contracts, header casing.

4. **Cross-service state staleness** — Service A caches data from Service B. Service B's data is context-dependent (varies by input). The cache returns stale/wrong data for different inputs.

5. **Concurrent cross-service coordination** — Fan-out requests to multiple services with results mapped back incorrectly due to ordering assumptions.

---

## Harness Changes

### Philosophy: minimal harness changes

Multi-language scenarios are structurally identical to single-language ones from the harness's perspective:
- `src/` contains all code (in per-service subdirectories)
- `setup.commands` handle per-service dependency installation
- Test scripts handle service lifecycle (start, health check, test, stop)
- The agent debugs in the workspace using `debug_launch`/`debug_attach` per service

The harness doesn't need to understand services, ports, or health checks. It runs commands and checks exit codes. The scenario's test infrastructure handles orchestration.

### Schema changes

**`config.ts` — `ScenarioConfigSchema`:**

```typescript
export const ScenarioConfigSchema = z.object({
  scenario: z.object({
    name: z.string(),
    language: z.union([z.string(), z.array(z.string())]),  // string | string[]
    description: z.string(),
    timeout_seconds: z.number(),
    level: z.number().int().min(1).max(7),                 // was max(6)
  }),
  services: z.array(z.object({
    name: z.string(),
    language: z.string(),
    dir: z.string(),
    port: z.number().optional(),
  })).optional(),                                           // new, informational
  setup: z.object({
    commands: z.array(z.string()).default([]),
  }).default({ commands: [] }),
  visible_test: z.object({ command: z.string() }),
  validation: z.object({ command: z.string() }),
});
```

**`Scenario` interface:**

```typescript
export interface Scenario {
  // ... existing fields ...
  language: string | string[];  // was: string
  /** Service descriptions for multi-language scenarios (informational) */
  services?: Array<{ name: string; language: string; dir: string; port?: number }>;
}
```

The `language` field drives:
- Report grouping and filtering
- Prerequisite checking (are all required debuggers installed?)
- Display in markdown reports

### Report changes

**`report.ts`:**

- `levelNums` extended to include 6 and 7
- `levelNames` extended:
  ```typescript
  6: "Adversarial",
  7: "Cross-Language",
  ```
- `ScenarioInfo.language` changed to `string` for display — arrays joined with `"+"`:
  ```typescript
  language: Array.isArray(r.scenarioMeta.language)
    ? r.scenarioMeta.language.join('+')
    : r.scenarioMeta.language,
  ```
- Language display in markdown: `*python+node+go — description*`

### No changes needed

- `harness.ts` — workspace prep, test execution, validation, and trace saving are all generic
- `runner.test.ts` — already iterates scenarios generically
- `scenarios.ts` — just passes config through, no language-specific logic

### CLAUDE.md support

The scenario's `src/CLAUDE.md` is copied into the workspace root by the existing `cp(srcDir, workDir)` call. Claude Code reads `CLAUDE.md` from the working directory automatically. No harness change needed.

---

## Scenario Directory Structure

```
scenarios/<name>/
  scenario.json
  prompt.md
  src/
    CLAUDE.md                    # Agent-visible project documentation
    start-services.sh            # Starts all services in background
    stop-services.sh             # Stops all services
    <service-a>/                 # One directory per service
      <source files>
      <dependency manifest>
    <service-b>/
      ...
    <service-c>/
      ...
    test-<name>.js               # Visible integration test
  hidden/
    test_validation.js           # Oracle validation
```

### Test script responsibilities

Both visible and hidden test scripts handle the full service lifecycle:

```javascript
import { spawn } from 'node:child_process';
import { describe, it, before, after } from 'node:test';

let services = [];

before(async () => {
  services.push(spawn('python', ['app.py'], { cwd: 'catalog-service', stdio: 'pipe' }));
  services.push(spawn('node', ['server.js'], { cwd: 'pricing-service', stdio: 'pipe' }));
  services.push(spawn('./order-service', [], { cwd: 'order-service', stdio: 'pipe' }));
  // Wait for all health endpoints
  await waitForHealth('http://localhost:5001/health', 10_000);
  await waitForHealth('http://localhost:5002/health', 10_000);
  await waitForHealth('http://localhost:5003/health', 10_000);
});

after(() => {
  for (const svc of services) svc.kill('SIGTERM');
});
```

This keeps the harness generic — it just runs `node --test test-pipeline.js` and checks the exit code.

### CLAUDE.md template

The CLAUDE.md acts as a realistic project README. It tells the agent:
- Architecture overview with service diagram
- Service table (name, language, port, directory)
- Per-service file layout descriptions
- How to start/stop services
- How to run tests
- API endpoint summary

It must NOT reveal bugs, mention debugging tools, or hint at what's wrong. It should read like documentation a developer would write for onboarding.

---

## Scenario 1: `multi-order-pipeline`

An e-commerce order processing system spanning three microservices. Customer orders flow through the Order Gateway (Go), which calls the Pricing Engine (Node.js) for price computation, which queries the Product Catalog (Python) for product data.

### Architecture

```
Customer → Order Gateway (Go :5003) → Pricing Engine (Node :5002) → Product Catalog (Python :5001)
                 ↓
          Order created
```

### `scenario.json`

```json
{
  "scenario": {
    "name": "multi-order-pipeline",
    "language": ["python", "node", "go"],
    "description": "Multi-service order pipeline produces wrong totals, missing discounts, and incorrect shipping costs",
    "timeout_seconds": 1500,
    "level": 7
  },
  "services": [
    { "name": "catalog-service", "language": "python", "dir": "catalog-service", "port": 5001 },
    { "name": "pricing-service", "language": "node", "dir": "pricing-service", "port": 5002 },
    { "name": "order-service", "language": "go", "dir": "order-service", "port": 5003 }
  ],
  "setup": {
    "commands": [
      "cd catalog-service && pip install -q -r requirements.txt",
      "cd pricing-service && npm install --silent",
      "cd order-service && go build -o order-service ."
    ]
  },
  "visible_test": {
    "command": "node --test test-pipeline.js 2>&1"
  },
  "validation": {
    "command": "node --test test_validation.js 2>&1"
  }
}
```

### Files (~5000 lines across 3 languages)

| Service | File | Purpose | Lines |
|---------|------|---------|-------|
| **catalog-service** (Python) | `app.py` | Flask routes, product listing, pagination | ~180 |
| | `models.py` | Product, Category, Supplier data classes | ~120 |
| | `data.py` | In-memory product database, seed data | ~200 |
| | `inventory.py` | Stock level management, reservation | ~130 |
| | `requirements.txt` | Flask dependency | ~5 |
| **pricing-service** (Node) | `server.js` | Express server, route setup | ~120 |
| | `pricing.js` | Core pricing computation, discount application | ~200 |
| | `promotions.js` | Promotion rules, coupon validation, volume tiers | ~180 |
| | `cache.js` | Product price cache with TTL | ~120 |
| | `tax.js` | Tax computation by jurisdiction | ~100 |
| | `package.json` | Express dependency | ~10 |
| **order-service** (Go) | `main.go` | HTTP server, route registration | ~120 |
| | `handlers.go` | Cart and order request handlers | ~220 |
| | `client.go` | HTTP clients for Pricing and Catalog services | ~200 |
| | `models.go` | Order, Cart, LineItem structs, JSON tags | ~130 |
| | `shipping.go` | Shipping cost calculation by weight and zone | ~120 |
| | `go.mod` | Go module definition | ~5 |
| **root** | `test-pipeline.js` | Visible integration test | ~80 |
| | `start-services.sh` | Service launcher | ~30 |
| | `stop-services.sh` | Service stopper | ~15 |
| | `CLAUDE.md` | Project documentation | ~80 |
| **hidden** | `test_validation.js` | Oracle validation | ~250 |

**Total:** ~2700 lines across ~20 files

### `prompt.md`

```markdown
The order processing pipeline is producing wrong results. A test order for 5 units of a
product should get a volume discount and correct shipping, but the order total is way off.
The shipping cost seems to be $0 for some products that definitely have weight. Some orders
also seem to have line item prices assigned to the wrong products.

The system is three services that communicate via HTTP — see CLAUDE.md for architecture.
The order flow starts in the Go order-service (`handlers.go`), which calls the Node.js
pricing-service, which queries the Python catalog-service. Multiple things seem wrong
across different parts of the system. Run `node --test test-pipeline.js` to see failures.
```

### Bug 1: String weight in Python JSON response (Python → Go)

**Location:** `catalog-service/data.py` (data source) → `order-service/models.go` (deserialization)

The Python catalog's product database has a data inconsistency. Most product weights are numeric, but the `"electronics"` category has weights stored as strings — an artifact of a CSV import:

```python
# data.py
PRODUCTS = [
    {"id": "ELEC-001", "name": "Wireless Mouse", "weight_kg": "0.15", "category": "electronics", ...},
    {"id": "ELEC-002", "name": "USB Hub",         "weight_kg": "0.32", "category": "electronics", ...},
    {"id": "HOME-001", "name": "Desk Lamp",       "weight_kg": 1.2,    "category": "home", ...},
    # ...
]
```

Python's `json.dumps()` faithfully serializes these as `"weight_kg": "0.15"` (JSON string) and `"weight_kg": 1.2` (JSON number).

Go's `json.Unmarshal` into a struct with `WeightKg float64` fails silently on string values — the field gets the zero value `0.0`:

```go
// models.go
type Product struct {
    ID       string  `json:"id"`
    Name     string  `json:"name"`
    WeightKg float64 `json:"weight_kg"`
    // ...
}
```

Go logs a decode warning but continues with the partially-populated struct. The shipping calculator uses `weight_kg = 0.0` for all electronics, computing $0 shipping.

**Why runtime-only:** Python's JSON output looks correct — it's valid JSON. The Go struct definition looks correct. You need to inspect either the HTTP response body (to see the string type) or the Go struct after unmarshaling (to see weight is 0.0). The warning log exists but is buried among other startup/request logs.

### Bug 2: Discount fraction vs dollar amount (Node → Go)

**Location:** `pricing-service/pricing.js` (returns fraction) → `order-service/handlers.go` (interprets as dollars)

The Node pricing engine computes volume discounts and returns them as decimal fractions:

```javascript
// pricing.js
function computeDiscount(quantity, tiers) {
    // Returns decimal: 0.15 means "15% off"
    for (const tier of tiers) {
        if (quantity >= tier.minQty) return tier.rate;
    }
    return 0;
}

// Response: { "items": [{ "basePrice": 79.99, "discount": 0.15, "finalPrice": 67.99 }] }
```

The Go order gateway receives this and applies the discount independently (for verification/audit):

```go
// handlers.go
func applyDiscount(basePrice float64, discount float64) float64 {
    return basePrice - discount  // Treats 0.15 as $0.15 off, not 15% off
}
```

For a $79.99 item with 15% discount:
- Node sends: `discount: 0.15`, `finalPrice: 67.99`
- Go computes: `79.99 - 0.15 = 79.84`
- Go uses its own computation, discarding Node's `finalPrice`

The order total is wrong by the entire discount amount minus 15 cents.

**Why cross-boundary:** Neither service has a bug in isolation. The field name `"discount"` is ambiguous. The pricing service's code clearly returns a rate. The Go code clearly subtracts a dollar amount. You need to inspect the actual JSON response and the Go variable to see the value `0.15` being interpreted two ways.

### Bug 3: Concurrent response ordering (Go internal)

**Location:** `order-service/client.go`

The Go order service prices each cart item by making parallel HTTP requests to the pricing service. It collects results through a channel and maps them back by index:

```go
// client.go
func priceItems(items []CartItem) ([]PricedItem, error) {
    results := make([]PricedItem, len(items))
    ch := make(chan indexedResult, len(items))

    for i, item := range items {
        go func(idx int, it CartItem) {
            priced := callPricingService(it)
            ch <- indexedResult{idx: idx, item: priced}
        }(i, item)
    }

    for i := 0; i < len(items); i++ {
        r := <-ch
        results[i] = r.item  // BUG: uses loop index `i`, not r.idx
    }
    return results, nil
}
```

The result struct carries the correct index (`r.idx`), but the collection loop maps to `results[i]` instead of `results[r.idx]`. When goroutines complete out of order, prices get assigned to wrong items. The first goroutine to finish goes to index 0, the second to index 1, etc. — regardless of which item it priced.

**Why runtime-only:** The code looks almost correct. The `indexedResult` struct has an `idx` field, making it look like proper indexed collection. You need to step through the goroutine execution with concurrent requests to see that `i` and `r.idx` differ when responses arrive out of order.

### Bug 4: Pagination drops query filters (Python → Node)

**Location:** `catalog-service/app.py` (pagination) → `pricing-service/pricing.js` (pagination follower)

The Python catalog paginates product listings. The pagination link generator builds `next_page` URLs:

```python
# app.py
@app.route('/products')
def list_products():
    page = int(request.args.get('page', 1))
    category = request.args.get('category')
    products = get_products(category=category, page=page, per_page=20)
    has_more = len(get_products(category=category, page=page+1, per_page=20)) > 0

    return jsonify({
        "products": products,
        "page": page,
        "next_page": f"/products?page={page + 1}" if has_more else None
    })
```

The `next_page` URL is always `/products?page=N` — it never preserves the `category` query parameter. The Node pricing service follows pagination to build a complete price list:

```javascript
// pricing.js
async function fetchAllProducts(category) {
    let url = `${CATALOG_URL}/products?category=${category}`;
    const allProducts = [];

    while (url) {
        const resp = await fetch(url);
        const data = await resp.json();
        allProducts.push(...data.products);
        url = data.next_page ? `${CATALOG_URL}${data.next_page}` : null;
    }
    return allProducts;
}
```

Page 1: correct — filtered by category. Page 2+: unfiltered — returns ALL products. The pricing computation includes products from wrong categories, inflating subtotals.

**Why cross-boundary:** Python's pagination is internally consistent — it generates valid links. Node's pagination follower is correct — it follows whatever link Python gives. The bug is in the contract. You need to inspect the `next_page` URL at runtime to see the missing `category` parameter.

### Bug 5: Price cache ignores quantity tiers (Node internal)

**Location:** `pricing-service/cache.js` → `pricing-service/pricing.js`

The Node pricing engine caches base prices fetched from the catalog to reduce HTTP calls:

```javascript
// cache.js
const priceCache = new Map();
const CACHE_TTL = 30_000;

export function getCachedPrice(productId) {
    const entry = priceCache.get(productId);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return entry.price;
    }
    return null;
}

export function setCachedPrice(productId, price) {
    priceCache.set(productId, { price, timestamp: Date.now() });
}
```

The cache key is just `productId`. But the catalog service returns quantity-dependent pricing — the base price varies by quantity tier (1-9 units: $12.99, 10-24: $11.49, 25+: $9.99). The cache stores the first-seen price (from a single-unit lookup) and returns it for all subsequent requests regardless of quantity.

```javascript
// pricing.js
async function getBasePrice(productId, quantity) {
    const cached = getCachedPrice(productId);
    if (cached !== null) return cached;  // Returns single-unit price for bulk orders

    const product = await fetchProduct(productId, quantity);
    setCachedPrice(productId, product.basePrice);
    return product.basePrice;
}
```

For a bulk order of 30 units, the first call gets $12.99 (single-unit, from a previous small order), and uses that for all 30 units instead of $9.99.

**Why runtime-only:** The caching logic is correct — it stores and retrieves by product ID, respects TTL. The quantity parameter is passed to `fetchProduct` but not to the cache. You need to inspect cache hits at runtime to see that the cached price doesn't match what the catalog would return for the given quantity.

### Bug 6: Content-Type mismatch on single-item endpoint (Go → Node)

**Location:** `order-service/client.go` → `pricing-service/server.js`

The Go client has two functions for calling the pricing service: `priceBatch` (bulk pricing) and `priceSingle` (one item). The batch endpoint was built first with proper JSON:

```go
// client.go
func priceBatch(items []CartItem) (*PricingResponse, error) {
    body, _ := json.Marshal(items)
    req, _ := http.NewRequest("POST", PRICING_URL+"/price", bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    // ...
}
```

The single-item endpoint was added later by copying priceBatch, but the Content-Type was accidentally left as the value from an earlier form-encoded prototype:

```go
func priceSingle(item CartItem) (*PricedItem, error) {
    body, _ := json.Marshal(item)
    req, _ := http.NewRequest("POST", PRICING_URL+"/price/single", bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")  // Wrong!
    // ...
}
```

Node's Express uses `express.json()` middleware, which only parses bodies with `Content-Type: application/json`. The form-encoded middleware parses the JSON body as URL-encoded data, producing garbled values. The pricing route gets `undefined` for all fields and falls back to default pricing.

**Why cross-boundary:** The Go code sends valid JSON. The Node route handler correctly processes JSON objects. The bug is in the HTTP header — visible only by inspecting the actual request at the Node endpoint or the Go request construction. The Go function name and logic look identical to the working batch function.

### Misdirection techniques

1. **Complex Go error handling** — `client.go` has elaborate retry logic with exponential backoff for HTTP failures. It looks like it could swallow errors but works correctly. Agent may spend time reviewing retry paths.

2. **Python's `decimal` module usage** — `data.py` uses `Decimal` for some price calculations with explicit rounding contexts. Looks like it could have precision issues but is correct.

3. **`// TODO: add connection pooling`** comment in Go's `client.go` near the working batch pricing function, not near the buggy single-item function.

4. **Node's `validateCoupon` with crypto hash** — `promotions.js` has SHA-256 coupon validation. Complex and suspicious but correct.

5. **Python's timezone-aware date handling** — `models.py` has timezone conversion logic for `last_restocked` dates. Looks like a date bug source but handles timezones correctly.

6. **Go's `sync.Mutex` on order ID generation** — `models.go` has a mutex-protected counter for generating order IDs. Looks like a potential deadlock or race but is correct.

7. **Misleading comments:**
   - `// discount is a dollar amount off the base price` in Go's `handlers.go` (incorrect — it's a fraction, and this comment reinforces the buggy interpretation)
   - `// cache key includes all pricing factors` in Node's `cache.js` (incorrect — only product ID, not quantity)
   - `// flat() handles nested pagination` near correct array flattening in `pricing.js`

### Visible test

```javascript
// test-pipeline.js — 6 tests

// Test 1: Order with electronics items
// Expected: correct shipping based on weight
// Fails: shipping is $0 (Bug 1 — weight is 0.0 from string unmarshal)

// Test 2: Bulk order with volume discount
// Expected: 15% discount applied correctly
// Fails: discount is $0.15 instead of ~$12 (Bug 2 — fraction vs dollars)

// Test 3: Multi-item order prices match items
// Expected: each line item has its correct price
// Fails intermittently: prices swapped between items (Bug 3 — concurrent ordering)

// Test 4: Category-filtered pricing
// Expected: only electronics products in pricing
// Fails: extra products from other categories appear (Bug 4 — pagination filter loss)

// Test 5: Bulk quantity gets tier pricing
// Expected: $9.99/unit for 30 units
// Fails: $12.99/unit (Bug 5 — cached single-unit price)

// Test 6: Single-item order completes (control)
// May pass or fail depending on whether single-item path hits Bug 6
```

### Hidden validation

```javascript
// test_validation.js — 20+ assertions

// Bug 1 (string weight):
// - Assert product ELEC-001 weight_kg is parsed as number in Go
// - Assert shipping cost for electronics items is > $0
// - Assert shipping cost matches expected calculation for weight 0.15kg

// Bug 2 (discount interpretation):
// - Assert 15% discount on $79.99 item gives ~$67.99 (not $79.84)
// - Assert discount is applied as percentage, not dollar amount
// - Assert order total matches pricing service's finalPrice

// Bug 3 (concurrent ordering):
// - Assert item A's price matches item A's product (not item B's)
// - Assert deterministic ordering across 10 repeated requests
// - Assert all line items have the correct product ID → price mapping

// Bug 4 (pagination filter):
// - Assert category-filtered request returns only products from that category
// - Assert page 2 of filtered request still has the filter applied
// - Assert total product count matches category count, not full catalog

// Bug 5 (cache ignores quantity):
// - Assert 30-unit order gets tier-3 pricing ($9.99), not tier-1 ($12.99)
// - Assert cache key includes quantity or cache is bypassed for tier pricing
// - Assert sequential requests with different quantities get different prices

// Bug 6 (Content-Type):
// - Assert single-item pricing returns correct price (not default)
// - Assert Content-Type header for single-item endpoint is application/json
// - Assert single-item and batch endpoints return consistent prices for same item

// Integration:
// - Full order flow with mixed categories, quantities, and discounts
// - Order total = sum of correctly-priced line items + correct shipping + tax
```

---

## CLAUDE.md for `multi-order-pipeline`

```markdown
# Order Pipeline

Multi-service order processing system. Three backend services handle product data,
pricing computation, and order management.

## Architecture

    Customer → Order Gateway (Go :5003) → Pricing Engine (Node :5002) → Product Catalog (Python :5001)

### Services

| Service | Language | Port | Directory |
|---------|----------|------|-----------|
| Product Catalog | Python (Flask) | 5001 | `catalog-service/` |
| Pricing Engine | Node.js (Express) | 5002 | `pricing-service/` |
| Order Gateway | Go (net/http) | 5003 | `order-service/` |

### Product Catalog (Python :5001)
Product database, stock levels, categories, and supplier info.
- `app.py` — Flask application, route handlers, pagination
- `models.py` — Product and Category data models
- `data.py` — In-memory product database with seed data
- `inventory.py` — Stock level management

### Pricing Engine (Node.js :5002)
Dynamic pricing, volume tiers, promotions, and tax calculation.
- `server.js` — Express server and route handlers
- `pricing.js` — Core pricing logic, catalog data fetching
- `promotions.js` — Promotion rules, coupon validation
- `cache.js` — Product price cache layer
- `tax.js` — Tax computation by jurisdiction

### Order Gateway (Go :5003)
Customer-facing API for cart management and order creation.
- `main.go` — HTTP server and route registration
- `handlers.go` — Request handlers for cart and order endpoints
- `client.go` — HTTP clients for calling Pricing and Catalog services
- `models.go` — Order, Cart, and LineItem data structures
- `shipping.go` — Shipping cost calculation by weight and zone

## Running

    # Start all services (background)
    ./start-services.sh

    # Stop all services
    ./stop-services.sh

    # Start individually
    cd catalog-service && python app.py &
    cd pricing-service && node server.js &
    cd order-service && go run . &

    # Run tests (starts and stops services automatically)
    node --test test-pipeline.js

## API

### Product Catalog (:5001)
- `GET /products` — List products (`?category=`, `?page=`, paginated 20/page)
- `GET /products/:id` — Single product with quantity-based pricing (`?quantity=`)
- `GET /health`

### Pricing Engine (:5002)
- `POST /price` — Batch pricing for cart items `{ "items": [...] }`
- `POST /price/single` — Price a single item `{ "productId": "...", "quantity": N }`
- `GET /promotions` — Active promotions list
- `GET /health`

### Order Gateway (:5003)
- `POST /orders` — Create order from cart
- `GET /orders/:id` — Order status
- `GET /health`
```

---

## Design Rules for L7

### Structural requirements

- **2-3 services** communicating via HTTP (REST/JSON). More services add complexity without proportional debugging value.
- **3 different languages.** The whole point is cross-runtime. Using 2 languages with 3 services is acceptable but less interesting.
- **Each service is independently debuggable.** The agent can `debug_launch` any service alone.
- **Test scripts handle service lifecycle.** The harness stays generic.
- **CLAUDE.md as project docs.** The agent's primary orientation tool.

### Bug distribution

- **3+ cross-boundary bugs** that exist in the gap between services (the defining L7 feature)
- **1-2 internal bugs** per service for depth within each language
- **5-7 total bugs** (more than L6's 4-5, justified by the larger codebase)
- At least one bug per service — the agent must investigate all three

### Cross-boundary bug requirements

Each cross-boundary bug must satisfy:
1. **Neither service is wrong in isolation.** Both do something reasonable for their language.
2. **The bug is in the data contract.** Type, format, interpretation, or timing.
3. **Runtime inspection is required.** You must observe the actual data at the boundary — reading source code on both sides doesn't reveal the discrepancy.
4. **The fix can be in either service** (or both) — the agent decides where to normalize.

### Misdirection requirements

- Each service has at least one red herring: complex-but-correct code
- Misleading comments reinforce the buggy interpretation of data contracts
- At least one service has a `// TODO` or `// FIXME` near correct code
- The most suspicious-looking code in each service is correct

### What the CLAUDE.md must include

- Architecture diagram showing service communication
- Service table with language, port, directory
- File descriptions per service (just filenames and purpose, no implementation details)
- How to start/stop services
- How to run tests
- API endpoints (method, path, brief description)

### What the CLAUDE.md must NOT include

- Bug hints or known issues
- References to debugging tools
- Implementation details that reveal data formats
- Comments about data contracts between services

---

## Future L7 Scenario Ideas

### `multi-data-pipeline` (Python + TypeScript + Go)

A data analytics pipeline:
- **Ingestion Service (Python)** — reads CSV/JSON data files, normalizes, publishes
- **Transform Service (TypeScript)** — schema validation, aggregation, enrichment
- **Storage/Query Service (Go)** — writes to embedded DB, serves query API

Bugs at boundaries: encoding (UTF-8 BOM), timestamp formats, null vs missing fields in JSON, schema evolution mismatch.

### `multi-chat-system` (Python + Node + Rust)

A real-time messaging system:
- **Auth Service (Rust)** — JWT token issuance, validation
- **Message Broker (Node.js)** — WebSocket gateway, message routing
- **AI Service (Python)** — message analysis, moderation, auto-responses

Bugs at boundaries: JWT claim types, WebSocket frame encoding, async message ordering, Unicode normalization in message content.

---

## Implementation Order

1. **Harness schema changes** — Update `config.ts` schema to accept `language` as string or array, bump level max to 7, add optional `services` field. Update `report.ts` level display.
2. **`multi-order-pipeline` implementation** — Build the three services, test scripts, CLAUDE.md, and hidden validation.
3. **Manual verification** — Start services, confirm visible test fails, apply all fixes, confirm both tests pass, revert fixes one-by-one to verify independence.
4. **Agent test run** — Run against Claude Code in all three modes. Baseline should fail. MCP mode is the target.

## Verification Checklist

- [ ] All three services start and respond to health checks
- [ ] Visible test fails with all bugs present
- [ ] Each bug independently causes at least one hidden assertion to fail
- [ ] Fixing 5 of 6 bugs still fails hidden validation
- [ ] Fixing all 6 bugs passes both visible and hidden tests
- [ ] CLAUDE.md accurately describes the architecture without revealing bugs
- [ ] Agent can `debug_launch` each service independently
- [ ] Test scripts reliably start/stop services (no port conflicts, no zombies)
- [ ] Setup commands work on a clean system with Python 3.10+, Node 20+, Go 1.21+
- [ ] No bug-revealing comments in any source file
- [ ] Misdirection elements are present and realistic in each service
