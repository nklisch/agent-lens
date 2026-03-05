The discount calculation in `discount.py` is producing incorrect totals for gold-tier customers. The test in `test_discount.py` demonstrates the failure.

Run the test first to see what's failing:

```bash
python3 -m pytest test_discount.py -x -v
```

Use the agent-lens debugging tools available to you to set breakpoints and inspect runtime values to find the root cause. Fix the bug so that `test_discount.py` passes.
