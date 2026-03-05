The `merge_sorted` function in `merge_sorted.py` is not stable: when two elements have equal priority, elements from the first list should appear before elements from the second list, but the output order is wrong.

The test in `test_merge.py` demonstrates the failure. Debug this issue and fix the bug so that `test_merge.py` passes.
