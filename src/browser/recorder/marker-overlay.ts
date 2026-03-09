import type { CDPClient } from "./cdp-client.js";

const BINDING_NAME = "agentLensMark";

/**
 * Page script injected via CDP into every recorded tab.
 * Adds a floating "◎ Mark" button (bottom-right) and a Ctrl+Shift+M shortcut.
 * Both call window.agentLensMark() which is a CDP Runtime binding → placeMarker().
 */
function getOverlayScript(): string {
	return `(function() {
  if (window.__agentLensOverlay) return;
  window.__agentLensOverlay = true;

  var btn = document.createElement('button');
  btn.setAttribute('id', '__agent_lens_mark_btn');
  btn.textContent = '◎ Mark';
  btn.title = 'Place agent-lens marker (Ctrl+Shift+M)';
  var s = btn.style;
  s.position = 'fixed';
  s.bottom = '16px';
  s.right = '16px';
  s.zIndex = '2147483647';
  s.background = '#1a1a2e';
  s.color = '#e2e8f0';
  s.border = '1px solid #4a5568';
  s.borderRadius = '6px';
  s.padding = '6px 12px';
  s.fontSize = '12px';
  s.fontFamily = 'monospace';
  s.cursor = 'pointer';
  s.opacity = '0.85';
  s.transition = 'opacity 0.15s, background 0.15s';
  s.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
  s.lineHeight = '1.4';

  btn.addEventListener('mouseenter', function() { btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', function() { btn.style.opacity = '0.85'; });

  function triggerMark() {
    window.agentLensMark('user');
    var orig = btn.textContent;
    btn.textContent = '\\u2713 Marked';
    btn.style.background = '#276749';
    setTimeout(function() {
      btn.textContent = orig;
      btn.style.background = '#1a1a2e';
    }, 1000);
  }

  btn.addEventListener('click', triggerMark);

  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      triggerMark();
    }
  });

  function mount() {
    if (document.body && !document.getElementById('__agent_lens_mark_btn')) {
      document.body.appendChild(btn);
    }
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
})();`;
}

/**
 * Registers the agentLensMark CDP binding on a tab session and injects the overlay script.
 * - The button and shortcut appear on the current page immediately.
 * - Page.addScriptToEvaluateOnNewDocument re-injects on every navigation.
 * - Runtime.bindingCalled events are forwarded to placeMarker().
 *
 * Returns a cleanup function that removes the event listener.
 */
export async function setupMarkerOverlay(cdpClient: CDPClient, sessionId: string, placeMarker: (label?: string) => Promise<unknown>): Promise<() => void> {
	// Register window.agentLensMark() as a callable CDP binding
	await cdpClient.sendToTarget(sessionId, "Runtime.addBinding", { name: BINDING_NAME }).catch(() => {});

	// Re-inject on every navigation
	await cdpClient.sendToTarget(sessionId, "Page.addScriptToEvaluateOnNewDocument", { source: getOverlayScript() }).catch(() => {});

	// Inject into the already-loaded current page
	await cdpClient.sendToTarget(sessionId, "Runtime.evaluate", { expression: getOverlayScript() }).catch(() => {});

	function onEvent(eventSessionId: string, method: string, params: Record<string, unknown>) {
		if (eventSessionId !== sessionId || method !== "Runtime.bindingCalled") return;
		if (params.name !== BINDING_NAME) return;
		const label = typeof params.payload === "string" && params.payload ? params.payload : undefined;
		placeMarker(label).catch(() => {});
	}

	cdpClient.on("event", onEvent);
	return () => cdpClient.off("event", onEvent);
}
