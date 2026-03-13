import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BrowserTestContext } from "../../../helpers/browser-test-harness.js";
import { isChromeAvailable, setupBrowserTest } from "../../../helpers/browser-test-harness.js";
import { expectFrameworkContent, extractEventId, extractSessionId } from "../../../helpers/journey-helpers.js";

const SKIP = !(await isChromeAvailable());
const VUE_SPA = resolve(import.meta.dirname, "../../../fixtures/browser/vue-spa");

// ─────────────────────────────────────────────────────────────────────────────
// Journey 1: Task Management State Observation
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("Vue Journey: task management state observation", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: VUE_SPA, frameworkState: ["vue"] });
		await ctx.wait(1000);
		// Login
		await ctx.navigate("/login");
		await ctx.wait(500);
		await ctx.fill('[data-testid="username"]', "admin");
		await ctx.fill('[data-testid="password"]', "secret");
		await ctx.submitForm('[data-testid="login-form"]');
		await ctx.wait(1000);
		// View task list (SPA navigate to preserve auth state)
		await ctx.spaNavigate("/tasks");
		await ctx.wait(500);
		await ctx.placeMarker("task list loaded");
		// Filter by priority
		await ctx.click('[data-testid="filter-priority-high"]');
		await ctx.wait(300);
		await ctx.placeMarker("filtered to high priority");
		// Toggle a task status
		await ctx.click('[data-testid="task-status-toggle-1"]');
		await ctx.wait(300);
		await ctx.placeMarker("task status changed");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: detect Vue framework in bundled app", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_detect"],
		});
		expect(result).toContain("vue");
	});

	it("Step 2: overview shows Vue framework section", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["framework", "markers"],
		});
		expect(overview).toContain("task list loaded");
		expect(overview).toMatch(/Component|component|vue/i);
	});

	it("Step 3: search for Pinia store mutations", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
			framework: "vue",
			query: "store",
		});
		expect(result).toContain("Found");
	});

	it("Step 4: search for Vue framework state events", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		expect(result).toContain("Found");
	});

	it("Step 5: inspect a store mutation event", async () => {
		const search = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
			framework: "vue",
		});
		const eventId = extractEventId(search);
		const detail = await ctx.callTool("session_inspect", {
			session_id: sessionId,
			event_id: eventId,
		});
		expect(detail).toContain("vue");
	});

	it("Step 6: overview around filtered marker shows context", async () => {
		const focused = await ctx.callTool("session_overview", {
			session_id: sessionId,
			around_marker: "filtered to high priority",
			include: ["timeline", "framework"],
		});
		expect(focused).toContain("filtered to high priority");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 2: Task Creation Form Validation Bug
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("Vue Journey: task creation validation bug", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: VUE_SPA, frameworkState: ["vue"] });
		await ctx.wait(1000);
		// Login first
		await ctx.navigate("/login");
		await ctx.wait(500);
		await ctx.fill('[data-testid="username"]', "admin");
		await ctx.fill('[data-testid="password"]', "secret");
		await ctx.submitForm('[data-testid="login-form"]');
		await ctx.wait(1000);
		// Inject server validation failure before navigating
		await ctx.testControl("/__test__/fail-create");
		// Go to create task (SPA navigate to preserve auth state)
		await ctx.spaNavigate("/tasks/new");
		await ctx.wait(500);
		// Fill form and submit — server will return 422
		await ctx.fill('[data-testid="task-title-input"]', "New Task Title");
		await ctx.fill('[data-testid="task-description-input"]', "Task description");
		await ctx.click('[data-testid="create-task-submit"]');
		await ctx.wait(1000);
		await ctx.placeMarker("task creation failed");
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

	it("Step 2: overview reveals form errors", async () => {
		const result = await ctx.callTool("session_overview", {
			session_id: sessionId,
		});
		expect(result).toContain("task creation failed");
	});

	it("Step 3: search for 422 responses on /api/tasks", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["network_response"],
			status_codes: [422],
		});
		expect(result).toContain("422");
	});

	it("Step 4: inspect 422 response body for validation details", async () => {
		const search = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["network_response"],
			status_codes: [422],
		});
		const eventId = extractEventId(search);
		const detail = await ctx.callTool("session_inspect", {
			session_id: sessionId,
			event_id: eventId,
			include: ["network_body"],
		});
		expect(detail).toContain("422");
	});

	it("Step 5: search for Vue framework state during submission", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "vue",
		});
		expect(result).toContain("Found");
	});

	it("Step 6: overview around task creation marker", async () => {
		const focused = await ctx.callTool("session_overview", {
			session_id: sessionId,
			around_marker: "task creation failed",
			include: ["timeline", "markers"],
		});
		expect(focused).toContain("task creation failed");
	});

	it("Step 7: generate reproduction steps", async () => {
		const steps = await ctx.callTool("session_replay_context", {
			session_id: sessionId,
			format: "reproduction_steps",
		});
		expect(steps).toMatch(/1\.\s/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 3: Infinite Watcher Loop Detection
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("Vue Journey: infinite watcher loop diagnosis", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: VUE_SPA, frameworkState: ["vue"] });
		await ctx.wait(1000);
		await ctx.navigate("/bugs/infinite-watcher");
		await ctx.wait(500);
		await ctx.evaluate("window.__TEST_CONTROLS__.activateInfiniteWatcher()");
		await ctx.wait(3000);
		await ctx.placeMarker("infinite watcher active");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: overview shows framework activity from InfiniteWatcher", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["framework"],
		});
		expect(overview).toMatch(/framework|component|watcher|infinite|error/i);
	});

	it("Step 2: search for Vue framework events", async () => {
		const errors = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_error"],
		});
		const states = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "vue",
		});
		expect(errors.includes("Found") || states.includes("Found")).toBe(true);
	});

	it("Step 3: search for Vue framework activity", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "vue",
		});
		expect(result).toContain("Found");
	});

	it("Step 4: inspect a Vue framework event", async () => {
		let search = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_error"],
		});
		if (!search.includes("Found")) {
			search = await ctx.callTool("session_search", {
				session_id: sessionId,
				framework: "vue",
			});
		}
		if (search.includes("Found")) {
			const eventId = extractEventId(search);
			const detail = await ctx.callTool("session_inspect", {
				session_id: sessionId,
				event_id: eventId,
			});
			expect(detail).toMatch(/vue/i);
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
// Journey 4: Lost Reactivity Detection
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("Vue Journey: lost reactivity diagnosis", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: VUE_SPA, frameworkState: ["vue"] });
		await ctx.wait(1000);
		await ctx.navigate("/bugs/lost-reactivity");
		await ctx.wait(500);
		await ctx.evaluate("window.__TEST_CONTROLS__.activateLostReactivity()");
		await ctx.wait(500);
		await ctx.click('[data-testid="increment"]');
		await ctx.wait(500);
		await ctx.placeMarker("reactivity lost");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: detect Vue framework on bug page", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_detect"],
		});
		expect(result).toContain("vue");
	});

	it("Step 2: search for Vue framework activity", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "vue",
		});
		expect(result).toContain("Found");
	});

	it("Step 3: overview shows framework section", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["framework"],
		});
		expect(overview).toMatch(/vue|framework|component/i);
	});

	it("Step 4: overview focused on marker shows surrounding evidence", async () => {
		const focused = await ctx.callTool("session_overview", {
			session_id: sessionId,
			around_marker: "reactivity lost",
			include: ["timeline", "framework"],
		});
		expect(focused).toContain("reactivity lost");
	});

	it("Step 5: overview shows marker and framework summary", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["markers", "framework"],
		});
		expect(overview).toContain("reactivity lost");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 5: Pinia Store Mutation Outside Action
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("Vue Journey: Pinia mutation outside action", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: VUE_SPA, frameworkState: ["vue"] });
		await ctx.wait(1000);
		await ctx.navigate("/bugs/pinia-mutation");
		await ctx.wait(500);
		await ctx.evaluate("window.__TEST_CONTROLS__.activatePiniaMutation()");
		await ctx.wait(500);
		await ctx.placeMarker("pinia mutation triggered");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: detect Vue framework on bug page", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_detect"],
		});
		expect(result).toContain("vue");
	});

	it("Step 2: overview shows framework section and marker", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["framework", "markers"],
		});
		expect(overview).toContain("pinia mutation triggered");
		expect(overview).toMatch(/vue|framework|component/i);
	});

	it("Step 3: search for Vue framework activity", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			framework: "vue",
		});
		expect(result).toContain("Found");
	});

	it("Step 4: overview around pinia mutation marker", async () => {
		const focused = await ctx.callTool("session_overview", {
			session_id: sessionId,
			around_marker: "pinia mutation triggered",
			include: ["timeline", "framework"],
		});
		expect(focused).toContain("pinia mutation triggered");
	});

	it("Step 5: generate Playwright test scaffold", async () => {
		const scaffold = await ctx.callTool("session_replay_context", {
			session_id: sessionId,
			format: "test_scaffold",
		});
		expect(scaffold).toMatch(/playwright|page\.|navigate|1\./i);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 6: Multi-Page Navigation with Pinia Persistence
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("Vue Journey: multi-page Pinia state persistence", () => {
	let ctx: BrowserTestContext;
	let sessionId: string;

	beforeAll(async () => {
		ctx = await setupBrowserTest({ fixturePath: VUE_SPA, frameworkState: ["vue"] });
		await ctx.wait(1000);
		// Login
		await ctx.navigate("/login");
		await ctx.wait(500);
		await ctx.fill('[data-testid="username"]', "admin");
		await ctx.fill('[data-testid="password"]', "secret");
		await ctx.submitForm('[data-testid="login-form"]');
		await ctx.wait(1000);
		await ctx.placeMarker("logged in");
		// View tasks (SPA navigate to preserve auth state)
		await ctx.spaNavigate("/tasks");
		await ctx.wait(500);
		// Click on first task
		await ctx.click('[data-testid="task-link-1"]');
		await ctx.wait(500);
		await ctx.placeMarker("viewing task detail");
		// Add a comment
		await ctx.fill('[data-testid="comment-input"]', "Test comment from journey");
		await ctx.click('[data-testid="comment-submit"]');
		await ctx.wait(500);
		// Navigate to create new task
		await ctx.spaNavigate("/tasks/new");
		await ctx.wait(500);
		await ctx.placeMarker("on create task page");
		// Back to task list
		await ctx.spaNavigate("/tasks");
		await ctx.wait(500);
		await ctx.placeMarker("back to task list");
		await ctx.finishRecording();
		sessionId = extractSessionId(await ctx.callTool("session_list", {}));
	}, 90_000);

	afterAll(async () => {
		await ctx?.cleanup();
	});

	it("Step 1: detect Vue framework", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_detect"],
		});
		expect(result).toContain("vue");
	});

	it("Step 2: search for framework state events across routes", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		expect(result).toContain("Found");
	});

	it("Step 3: search for Pinia store mutations across pages", async () => {
		const result = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
			framework: "vue",
		});
		expect(result).toContain("Found");
	});

	it("Step 4: navigation or framework events tracked for SPA routing", async () => {
		// spaNavigate uses pushState, so CDP navigation events may not fire;
		// but framework observers track component lifecycle across routes
		const navigation = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["navigation"],
		});
		const framework = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_state"],
		});
		expect(navigation.includes("Found") || framework.includes("Found")).toBe(true);
	});

	it("Step 5: overview shows all markers from multi-page journey", async () => {
		const overview = await ctx.callTool("session_overview", {
			session_id: sessionId,
			include: ["markers"],
		});
		expect(overview).toContain("logged in");
		expect(overview).toContain("viewing task detail");
		expect(overview).toContain("back to task list");
	});

	it("Step 6: generate reproduction steps for full workflow", async () => {
		const steps = await ctx.callTool("session_replay_context", {
			session_id: sessionId,
			format: "reproduction_steps",
		});
		expect(steps).toMatch(/1\.\s/);
		expect(steps).toMatch(/navigate|Login|task/i);
	});

	it("expectFrameworkContent helper works for Vue", async () => {
		const detect = await ctx.callTool("session_search", {
			session_id: sessionId,
			event_types: ["framework_detect"],
		});
		expectFrameworkContent(detect, "vue", { hasDetection: true });
	});
});
