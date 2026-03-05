The `validationReport` function in `parser.js` is producing inconsistent results. Some valid email addresses are being marked as invalid, and the count of valid vs invalid emails changes depending on the order and number of users processed.

The test in `test-parser.js` demonstrates the failure. Debug this issue and fix the bug so that `test-parser.js` passes.
