import type { EventType, RecordedEvent } from "../types.js";

interface InputEventData {
	type: "click" | "submit" | "change" | "marker" | "cls" | "storage" | "dom_mutation";
	ts: number;
	selector?: string;
	text?: string;
	tag?: string;
	action?: string;
	fields?: Record<string, string>;
	value?: string | number;
	label?: string;
	metric?: string;
	// Storage fields
	storageType?: "local" | "session";
	changeType?: "added" | "set" | "removed" | "cleared";
	key?: string;
	oldValue?: string;
	newValue?: string;
	crossTab?: boolean;
	// DOM mutation fields
	added?: Array<{ selector: string; tag: string; text?: string }>;
	removed?: Array<{ selector: string; tag: string }>;
}

/**
 * Captures user interactions (clicks, form submissions, field changes) via a
 * minimal script injected into each page via Page.addScriptToEvaluateOnNewDocument.
 *
 * Events are reported back through console.debug('__BL__', ...) and intercepted
 * from the Runtime.consoleAPICalled stream.
 */
export class InputTracker {
	/** Get the injection script source to be injected into each page. */
	getInjectionScript(): string {
		return `(function() {
  function sel(el) {
    if (el.id) return '#' + el.id;
    if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    return el.tagName.toLowerCase();
  }

  function report(type, detail) {
    try {
      console.debug('__BL__', JSON.stringify(Object.assign({ type: type, ts: Date.now() }, detail)));
    } catch (e) {}
  }

  document.addEventListener('click', function(e) {
    var t = e.target.closest('[id],[name],[data-testid],[role="button"],a,button,input,select,label');
    if (!t) return;
    report('click', { selector: sel(t), text: (t.textContent || '').trim().slice(0, 80), tag: t.tagName.toLowerCase() });
  }, true);

  document.addEventListener('submit', function(e) {
    var form = e.target;
    var fields = {};
    var inputs = form.querySelectorAll('input,select,textarea');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var name = inp.name || inp.id || sel(inp);
      fields[name] = inp.type === 'password' ? '[MASKED]' : (inp.value || '').slice(0, 200);
    }
    report('submit', { selector: sel(form), action: form.action, fields: fields });
  }, true);

  document.addEventListener('change', function(e) {
    var t = e.target;
    report('change', {
      selector: sel(t),
      value: t.type === 'password' ? '[MASKED]' : (t.value || '').slice(0, 200),
      tag: t.tagName.toLowerCase()
    });
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
      e.preventDefault();
      report('marker', { label: 'Keyboard marker' });
    }
  }, true);

  if (typeof PerformanceObserver !== 'undefined') {
    var clsValue = 0;
    var lastReported = 0;
    try {
      new PerformanceObserver(function(list) {
        for (var entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        if (clsValue - lastReported >= 0.05) {
          lastReported = clsValue;
          report('cls', { metric: 'CLS', value: clsValue });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}
  }

  // Storage change tracking
  (function() {
    function proxyStorage(storage, storageName) {
      var origSetItem = storage.setItem.bind(storage);
      var origRemoveItem = storage.removeItem.bind(storage);
      var origClear = storage.clear.bind(storage);

      storage.setItem = function(key, value) {
        var oldValue;
        try { oldValue = storage.getItem(key); } catch(e) {}
        origSetItem(key, value);
        report('storage', {
          storageType: storageName,
          changeType: oldValue === null ? 'added' : 'set',
          key: key,
          oldValue: oldValue === null ? undefined : oldValue,
          newValue: String(value).slice(0, 500)
        });
      };

      storage.removeItem = function(key) {
        var oldValue;
        try { oldValue = storage.getItem(key); } catch(e) {}
        origRemoveItem(key);
        if (oldValue !== null) {
          report('storage', {
            storageType: storageName,
            changeType: 'removed',
            key: key,
            oldValue: String(oldValue).slice(0, 500)
          });
        }
      };

      storage.clear = function() {
        origClear();
        report('storage', { storageType: storageName, changeType: 'cleared' });
      };
    }

    try { proxyStorage(localStorage, 'local'); } catch(e) {}
    try { proxyStorage(sessionStorage, 'session'); } catch(e) {}

    // Also capture cross-tab storage events (other tabs mutating localStorage)
    window.addEventListener('storage', function(e) {
      if (e.storageArea === localStorage || e.storageArea === sessionStorage) {
        report('storage', {
          storageType: e.storageArea === localStorage ? 'local' : 'session',
          changeType: e.newValue === null ? 'removed' : (e.oldValue === null ? 'added' : 'set'),
          key: e.key || '',
          oldValue: e.oldValue ? String(e.oldValue).slice(0, 500) : undefined,
          newValue: e.newValue ? String(e.newValue).slice(0, 500) : undefined,
          crossTab: true
        });
      }
    });
  })();

  // DOM mutation tracking
  (function() {
    var MEANINGFUL_TAGS = {
      FORM: 1, DIALOG: 1, SECTION: 1, ARTICLE: 1, MAIN: 1, NAV: 1,
      ASIDE: 1, HEADER: 1, FOOTER: 1, H1: 1, H2: 1, H3: 1, H4: 1,
      H5: 1, H6: 1, TABLE: 1
    };
    var SKIP_CONTAINERS = { SCRIPT: 1, STYLE: 1, HEAD: 1, NOSCRIPT: 1 };

    function isMeaningful(el) {
      if (!el || el.nodeType !== 1) return false;
      var tag = el.tagName;
      if (SKIP_CONTAINERS[tag]) return false;
      if (MEANINGFUL_TAGS[tag]) return true;
      if (el.id || el.getAttribute('data-testid') || el.getAttribute('role')) return true;
      return false;
    }

    function selFor(el) {
      if (el.id) return '#' + el.id;
      if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
      if (el.getAttribute('role')) return el.tagName.toLowerCase() + '[role="' + el.getAttribute('role') + '"]';
      return el.tagName.toLowerCase();
    }

    var pendingAdded = [];
    var pendingRemoved = [];
    var debounceTimer = null;

    function flush() {
      debounceTimer = null;
      var added = pendingAdded.splice(0);
      var removed = pendingRemoved.splice(0);
      if (added.length === 0 && removed.length === 0) return;
      report('dom_mutation', {
        added: added.slice(0, 10),
        removed: removed.slice(0, 10)
      });
    }

    try {
      var observer = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (isMeaningful(n)) {
              pendingAdded.push({
                selector: selFor(n),
                tag: n.tagName.toLowerCase(),
                text: (n.textContent || '').trim().slice(0, 100)
              });
            }
          }
          for (var k = 0; k < m.removedNodes.length; k++) {
            var r = m.removedNodes[k];
            if (isMeaningful(r)) {
              pendingRemoved.push({
                selector: selFor(r),
                tag: r.tagName.toLowerCase()
              });
            }
          }
        }
        if ((pendingAdded.length > 0 || pendingRemoved.length > 0) && !debounceTimer) {
          debounceTimer = setTimeout(flush, 500);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });
    } catch(e) {}
  })();
})();`;
	}

	/**
	 * Process a __BL__ prefixed console message into a RecordedEvent.
	 * Returns null if the data is invalid or represents an internal marker event
	 * (markers are handled separately by the orchestrator).
	 */
	processInputEvent(data: string, tabId: string): RecordedEvent | null {
		let parsed: InputEventData;
		try {
			parsed = JSON.parse(data) as InputEventData;
		} catch {
			return null;
		}

		if (!parsed.type || !parsed.ts) return null;

		// Keyboard marker events are surfaced as marker placement requests by the orchestrator
		if (parsed.type === "marker") {
			return this.buildEvent("marker", tabId, parsed.ts, `Keyboard marker: ${parsed.label ?? "unnamed"}`, { label: parsed.label, source: "keyboard" });
		}

		// CLS performance events from the PerformanceObserver injection
		if (parsed.type === "cls") {
			const value = typeof parsed.value === "string" ? Number.parseFloat(parsed.value) : (parsed.value ?? 0);
			return this.buildEvent("performance", tabId, parsed.ts, `CLS: ${value}`, {
				metric: "CLS",
				value,
			});
		}

		// Storage change events from the localStorage/sessionStorage proxy injection
		if (parsed.type === "storage") {
			const storageLabel = parsed.storageType === "local" ? "localStorage" : "sessionStorage";
			let summary: string;
			if (parsed.changeType === "cleared") {
				summary = `${storageLabel} cleared`;
			} else if (parsed.changeType === "removed") {
				summary = `${storageLabel}["${parsed.key}"] removed`;
			} else {
				summary = `${storageLabel}["${parsed.key}"] ${parsed.changeType}: ${(parsed.newValue ?? "").slice(0, 80)}`;
			}
			return this.buildEvent("storage_change", tabId, parsed.ts, summary, {
				storageType: parsed.storageType,
				changeType: parsed.changeType,
				key: parsed.key,
				oldValue: parsed.oldValue,
				newValue: parsed.newValue,
				crossTab: parsed.crossTab ?? false,
			});
		}

		// DOM mutation events from the MutationObserver injection
		if (parsed.type === "dom_mutation") {
			const added = parsed.added ?? [];
			const removed = parsed.removed ?? [];
			const parts: string[] = [];
			if (added.length > 0) parts.push(`+${added.length} ${added.map((e) => e.selector).join(", ")}`);
			if (removed.length > 0) parts.push(`-${removed.length} ${removed.map((e) => e.selector).join(", ")}`);
			const summary = `DOM: ${parts.join("; ")}`.slice(0, 300);
			return this.buildEvent("dom_mutation", tabId, parsed.ts, summary, {
				added,
				removed,
			});
		}

		return this.buildUserInputEvent(parsed, tabId);
	}

	private buildEvent(type: EventType, tabId: string, ts: number, summary: string, data: Record<string, unknown>): RecordedEvent {
		return { id: crypto.randomUUID(), timestamp: ts, type, tabId, summary, data };
	}

	private buildUserInputEvent(parsed: InputEventData, tabId: string): RecordedEvent | null {
		const selector = parsed.selector ?? "unknown";

		switch (parsed.type) {
			case "click": {
				const text = parsed.text ? ` "${parsed.text}"` : "";
				return this.buildEvent("user_input", tabId, parsed.ts, `Click ${selector}${text}`, { action: "click", selector, text: parsed.text, tag: parsed.tag });
			}

			case "submit": {
				const fieldCount = parsed.fields ? Object.keys(parsed.fields).length : 0;
				return this.buildEvent("user_input", tabId, parsed.ts, `Form submit ${selector} (${fieldCount} fields)`, { action: "submit", selector, formAction: parsed.action, fields: parsed.fields });
			}

			case "change": {
				const displayValue = parsed.value === "[MASKED]" ? "[MASKED]" : `"${parsed.value ?? ""}"`;
				return this.buildEvent("user_input", tabId, parsed.ts, `Change ${selector} → ${displayValue}`, { action: "change", selector, value: parsed.value, tag: parsed.tag });
			}

			default:
				return null;
		}
	}
}
