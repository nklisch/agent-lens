The `validateAll` function in `validators.js` is returning the same results for every range validator. No matter what ranges are configured, all validators seem to check the same range — the last one in the list.

The test in `test-validators.js` demonstrates the failure. Debug this issue and fix the bug so that `test-validators.js` passes.
