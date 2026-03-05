"""Hidden oracle tests — copied into workspace after agent finishes."""
from merge_sorted import merge_all, merge_sorted, sort_by_priority


def test_stable_equal_keys_single_pair():
    a = [{"id": "a", "score": 10}]
    b = [{"id": "b", "score": 10}]
    result = merge_sorted(a, b, key=lambda x: x["score"])
    assert result[0]["id"] == "a", f"Equal score: a should come first, got {result}"


def test_stable_equal_keys_multiple():
    a = [{"id": "a1", "priority": 5}, {"id": "a2", "priority": 5}]
    b = [{"id": "b1", "priority": 5}, {"id": "b2", "priority": 5}]
    result = merge_sorted(a, b, key=lambda x: x["priority"])
    ids = [item["id"] for item in result]
    assert ids == ["a1", "a2", "b1", "b2"], f"Stability violated: {ids}"


def test_mixed_priorities():
    a = [{"v": 1}, {"v": 3}, {"v": 5}]
    b = [{"v": 2}, {"v": 3}, {"v": 4}]
    result = merge_sorted(a, b, key=lambda x: x["v"])
    values = [item["v"] for item in result]
    assert values == [1, 2, 3, 3, 4, 5], f"Wrong merge order: {values}"
    # When v==3 appears in both, a's comes first
    threes = [item for item in result if item["v"] == 3]
    assert threes[0] is a[1], "a's duplicate should come before b's duplicate"


def test_merge_all_three_lists():
    lists = [[1, 4, 7], [2, 5, 8], [3, 6, 9]]
    result = merge_all(lists)
    assert result == list(range(1, 10)), f"merge_all failed: {result}"


def test_empty_lists():
    assert merge_sorted([], [1, 2]) == [1, 2]
    assert merge_sorted([1, 2], []) == [1, 2]
    assert merge_sorted([], []) == []


def test_sort_by_priority_stable():
    tasks = [
        {"name": "task-3", "priority": 2},
        {"name": "task-1", "priority": 1},
        {"name": "task-4", "priority": 2},
        {"name": "task-2", "priority": 1},
        {"name": "task-5", "priority": 3},
    ]
    result = sort_by_priority(tasks)
    names = [t["name"] for t in result]
    assert names == ["task-1", "task-2", "task-3", "task-4", "task-5"], f"Unstable sort: {names}"


def test_regression_stability_preserved():
    """Regression: confirm >= was changed to > so equal keys remain stable."""
    a = [{"x": 1}, {"x": 2}, {"x": 3}]
    b = [{"x": 1}, {"x": 2}, {"x": 3}]
    result = merge_sorted(a, b, key=lambda item: item["x"])
    # At every position where keys are equal, a's element must come first
    for i in range(3):
        assert result[i * 2] is a[i], f"Position {i*2}: expected a[{i}], got {result[i*2]}"
        assert result[i * 2 + 1] is b[i], f"Position {i*2+1}: expected b[{i}], got {result[i*2+1]}"
