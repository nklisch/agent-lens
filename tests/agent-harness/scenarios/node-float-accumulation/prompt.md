The `splitBill` function in `bill.js` is producing incorrect results. When splitting a bill, `totalShares` doesn't match `totalWithTip` — the rounded shares don't sum to the expected total.

The test in `test-bill.js` demonstrates the failure. Debug this issue and fix the bug so that `test-bill.js` passes.
