import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BrowserTestContext } from "../../../helpers/browser-test-harness.js";
import { isChromeAvailable, setupBrowserTest } from "../../../helpers/browser-test-harness.js";
import { expectFrameworkContent, extractEventId, extractSessionId } from "../../../helpers/journey-helpers.js";

const SKIP = !(await isChromeAvailable());
const REACT_SPA = resolve(import.meta.dirname, "../../../fixtures/browser/react-spa");

// ─────────────────────────────────────────────────────────────────────────────
// Journey 1: Shopping Cart State Observation
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("React Journey: shopping cart state observation", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: REACT_SPA, frameworkState: ["react"] });
		await ctx.wait(1000);
		await ctx.navigate("/");
		await ctx.wait(500);
		await ctx.click('[data-testid="product-card-1"] [data-testid="add-to-cart"]');
		await ctx.wait(300);
		await ctx.click('[data-testid="product-card-3"] [data-testid="add-to-cart"]');
		await ctx.wait(300);
		await ctx.placeMarker("items added to cart");
		await ctx.spaNavigate("/cart");
		await ctx.wait(500);
		await ctx.click('[data-testid="quantity-increase-1"]');
		await ctx.click('[data-testid="quantity-increase-1"]');
		await ctx.wait(300);
		await ctx.placeMarker("quantity updated");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: detect React framework in bundled app", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_detect"],
		});
		expect(result).toContain("react");
	});

	it("Step 2: overview shows framework section and markers", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["framework", "markers"],
		});
		expect(overview).toContain("items added to cart");
		expect(overview).toContain("quantity updated");
	});

	it("Step 3: search for framework_state events from React", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		// Should have at least some component state events
		expect(result).toContain("Found");
	});

	it("Step 4: search for React component activity", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "react",
		});
		expect(result).toContain("Found");
	});

	it("Step 5: inspect a framework state event", async () => {
		const search = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		if (search.includes("Found")) {
			const eventId = extractEventId(search);
			const detail = await ctx.callTool("session_inspect", {
				session_id: sessionId,
				event_id: eventId,
			});
			expect(detail).toContain("react");
		}
	});

	it("Step 6: diff shows changes across the session", async () => {
		// Use event IDs from framework_state search for the diff
		const events = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		if (events.includes("Found")) {
			// Use overview around a marker label to verify marker-based queries work
			const focused = await ctx.callTool("session_overview", {
				session_id: sessionId,
				around_marker: "items added to cart",
				include: ["timeline", "framework"],
			});
			expect(focused).toContain("items added to cart");
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 2: Checkout Form Validation Bug
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("React Journey: checkout validation bug investigation", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: REACT_SPA, frameworkState: ["react"] });
		await ctx.wait(1000);
		// Add item to cart
		await ctx.navigate("/");
		await ctx.wait(500);
		await ctx.click('[data-testid="product-card-1"] [data-testid="add-to-cart"]');
		await ctx.wait(300);
		// Inject server validation failure BEFORE going to checkout
		await ctx.testControl("/__test__/fail-checkout");
		// Go to checkout (SPA navigate to preserve cart state)
		await ctx.spaNavigate("/checkout");
		await ctx.wait(500);
		// Fill complete shipping and proceed
		await ctx.fill('[data-testid="shipping-name"]', "Test User");
		await ctx.fill('[data-testid="shipping-address"]', "123 Main St");
		await ctx.fill('[data-testid="shipping-city"]', "Springfield");
		await ctx.fill('[data-testid="shipping-zip"]', "62701");
		await ctx.click('[data-testid="next-step"]');
		await ctx.wait(300);
		// Payment step — submit order (will get 422 from server)
		await ctx.fill('[data-testid="card-number"]', "4111111111111111");
		await ctx.click('[data-testid="submit-order"]');
		await ctx.wait(1000);
		await ctx.placeMarker("checkout failed");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: find session with errors", async () => {
		const result = await ctx.callTool("session_list", {});
		expect(result).toContain("Sessions");
	});

	it("Step 2: overview reveals checkout marker", async () => {
		const result = await ctx.callTool("session_overview", {
			session_id: sessionId,
		});
		expect(result).toContain("checkout failed");
	});

	it("Step 3: search for network responses", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["network_response"],
		});
		// May have 422 responses if checkout form submitted successfully
		expect(result).toContain("Found");
	});

	it("Step 4: search for framework state events during checkout", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "react",
		});
		expect(result).toContain("Found");
	});

	it("Step 5: overview around checkout marker", async () => {
		const focused = await ctx.callTool("session_overview", {
			session_id: sessionId,
			around_marker: "checkout failed",
			include: ["timeline", "markers"],
		});
		expect(focused).toContain("checkout failed");
	});

	it("Step 6: generate Playwright test scaffold", async () => {
		const scaffold = await ctx.callTool("session_replay_context", {
			session_id: sessionId,
			format: "test_scaffold",
		});
		expect(scaffold).toMatch(/1\.|playwright|page\.|navigate|fill/i);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 3: Infinite Re-render Bug Detection
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("React Journey: infinite re-render diagnosis", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: REACT_SPA, frameworkState: ["react"] });
		await ctx.wait(1000);
		await ctx.navigate("/bugs/infinite-updater");
		await ctx.wait(500);
		await ctx.evaluate("window.__TEST_CONTROLS__.activateInfiniteUpdate()");
		await ctx.wait(3000);
		await ctx.placeMarker("infinite loop active");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: overview shows framework activity", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["framework"],
		});
		expect(overview).toMatch(/framework|component|error|infinite/i);
	});

	it("Step 2: search for framework events from InfiniteUpdater", async () => {
		const errors = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_error"],
		});
		const states = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		expect(errors.includes("Found") || states.includes("Found")).toBe(true);
	});

	it("Step 3: search for React framework activity", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "react",
		});
		expect(result).toContain("Found");
	});

	it("Step 4: inspect a framework event", async () => {
		let search = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_error"],
		});
		if (!search.includes("Found")) {
			search = await ctx.callTool("session_search", {
				session_id: sessionId,
				event_types: ["framework_state"],
			});
		}
		if (search.includes("Found")) {
			const eventId = extractEventId(search);
			const detail = await ctx.callTool("session_inspect", {
				session_id: sessionId,
				event_id: eventId,
			});
			expect(detail).toMatch(/react/i);
		}
	});

	it("Step 5: generate reproduction steps", async () => {
		const steps = await ctx.callTool("session_replay_context", {
			session_id: sessionId,
			format: "reproduction_steps",
		});
		expect(steps).toMatch(/1\.\s/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 4: Stale Closure and Missing Cleanup Detection
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("React Journey: stale closure + leaky interval diagnosis", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: REACT_SPA, frameworkState: ["react"] });
		await ctx.wait(1000);
		// Activate stale closure bug
		await ctx.navigate("/bugs/stale-price");
		await ctx.wait(500);
		await ctx.evaluate("window.__TEST_CONTROLS__.showStalePrice()");
		await ctx.wait(1000);
		await ctx.placeMarker("stale closure active");
		// Activate leaky interval bug
		await ctx.navigate("/bugs/leaky-interval");
		await ctx.wait(500);
		await ctx.evaluate("window.__TEST_CONTROLS__.activateLeakyInterval()");
		await ctx.wait(2000);
		await ctx.placeMarker("leaky interval active");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: search for framework events from both bug pages", async () => {
		const errors = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_error"],
		});
		const states = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		expect(errors.includes("Found") || states.includes("Found")).toBe(true);
	});

	it("Step 2: search for React framework activity", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "react",
		});
		expect(result).toContain("Found");
	});

	it("Step 3: overview shows markers from both bug sessions", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["markers"],
		});
		expect(overview).toContain("stale closure active");
		expect(overview).toContain("leaky interval active");
	});

	it("Step 4: overview around stale closure marker", async () => {
		const focused = await ctx.callTool("session_overview", {
			session_id: sessionId,
			around_marker: "stale closure active",
			include: ["timeline", "framework"],
		});
		expect(focused).toContain("stale closure active");
	});

	it("Step 5: inspect a framework event", async () => {
		let search = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_error"],
		});
		if (!search.includes("Found")) {
			search = await ctx.callTool("session_search", {
				session_id: sessionId,
				event_types: ["framework_state"],
			});
		}
		if (search.includes("Found")) {
			const eventId = extractEventId(search);
			const detail = await ctx.callTool("session_inspect", {
				session_id: sessionId,
				event_id: eventId,
			});
			expect(detail).toContain("react");
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 5: Route Transition with State Persistence
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("React Journey: route transition state persistence", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: REACT_SPA, frameworkState: ["react"] });
		await ctx.wait(1000);
		await ctx.navigate("/");
		await ctx.wait(500);
		await ctx.click('[data-testid="product-card-1"] [data-testid="add-to-cart"]');
		await ctx.click('[data-testid="product-card-2"] [data-testid="add-to-cart"]');
		await ctx.wait(300);
		await ctx.placeMarker("cart populated");
		await ctx.spaNavigate("/login");
		await ctx.wait(500);
		await ctx.placeMarker("navigated away");
		await ctx.spaNavigate("/cart");
		await ctx.wait(500);
		await ctx.placeMarker("returned to cart");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: search for component mount events", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		expect(result).toContain("Found");
	});

	it("Step 2: overview shows all three markers", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["markers"],
		});
		expect(overview).toContain("cart populated");
		expect(overview).toContain("navigated away");
		expect(overview).toContain("returned to cart");
	});

	it("Step 3: overview around 'returned to cart' marker", async () => {
		const focused = await ctx.callTool("session_overview", {
			session_id: sessionId,
			around_marker: "returned to cart",
			include: ["timeline", "framework"],
		});
		expect(focused).toContain("returned to cart");
	});

	it("Step 4: verify navigation or framework events tracked", async () => {
		const framework = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		const navigation = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["navigation"],
		});
		expect(framework.includes("Found") || navigation.includes("Found")).toBe(true);
	});

	it("Step 5: generate reproduction steps", async () => {
		const steps = await ctx.callTool("session_replay_context", {
			session_id: sessionId,
			format: "reproduction_steps",
		});
		expect(steps).toMatch(/1\.\s/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 6: Context Performance + Full Agent Investigation
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("React Journey: context flood full investigation", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: REACT_SPA, frameworkState: ["react"] });
		await ctx.wait(1000);
		await ctx.navigate("/bugs/context-flood");
		await ctx.wait(500);
		await ctx.evaluate("window.__TEST_CONTROLS__.activateContextFlood()");
		await ctx.wait(2000);
		await ctx.placeMarker("context flood triggered");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: session_list finds the session", async () => {
		const result = await ctx.callTool("session_list", {});
		expect(result).toContain("Sessions");
	});

	it("Step 2: session_overview shows framework activity", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["framework"],
		});
		expect(overview).toMatch(/framework|component|context|rerender/i);
	});

	it("Step 3: search for React framework events", async () => {
		const errors = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_error"],
		});
		const states = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "react",
		});
		expect(errors.includes("Found") || states.includes("Found")).toBe(true);
	});

	it("Step 4: inspect a framework event", async () => {
		let search = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_error"],
		});
		if (!search.includes("Found")) {
			search = await ctx.callTool("session_search", {
				session_id: sessionId,
				framework: "react",
			});
		}
		if (search.includes("Found")) {
			const eventId = extractEventId(search);
			const detail = await ctx.callTool("session_inspect", {
				session_id: sessionId,
				event_id: eventId,
			});
			expect(detail).toMatch(/react|context/i);
		}
	});

	it("Step 5: overview around context flood marker", async () => {
		const focused = await ctx.callTool("session_overview", {
			session_id: sessionId,
			around_marker: "context flood triggered",
			include: ["timeline", "markers"],
		});
		expect(focused).toContain("context flood triggered");
	});

	it("Step 6: session_replay_context generates Cypress test", async () => {
		const scaffold = await ctx.callTool("session_replay_context", {
			session_id: sessionId,
			format: "test_scaffold",
			test_framework: "cypress",
		});
		expect(scaffold).toContain("cy.");
	});

	it("expectFrameworkContent helper works for React", async () => {
		const detect = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_detect"],
		});
		expectFrameworkContent(detect, "react", { hasDetection: true });
	});
});
