/**
 * Returns the injection script that installs window.__krometrail on the page.
 * Uses the __BL__ console.debug protocol to communicate back to the recorder.
 */
export function getAnnotationInjectionScript(): string {
	return `(function() {
  try {
    if (window.__krometrail) return;
    window.__krometrail = {
      mark: function(label, opts) {
        try {
          console.debug('__BL__', JSON.stringify({
            type: 'annotation',
            ts: Date.now(),
            label: label,
            severity: opts && opts.severity,
            metadata: opts && opts.data,
            promote: opts && opts.marker
          }));
        } catch (e) {}
      }
    };
  } catch (e) {}
})();`;
}
