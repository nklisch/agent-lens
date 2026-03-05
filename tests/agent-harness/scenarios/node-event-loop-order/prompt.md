The `processRequest` function in `config-loader.js` always uses fallback values for timeout and maxRetries, even though `fetchConfig` returns the correct configuration. The `configLoaded` field in the result is always `false`.

The test in `test-config.js` demonstrates the failure. Debug this issue and fix the bug so that `test-config.js` passes.
