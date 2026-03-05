"""Visible failing test — agent can see and run this."""
from merge_sorted import merge_sorted, sort_by_priority


def test_stable_merge_equal_keys():
    # When two elements have the same priority, a's elements must come first.
    a = [{"id": "a1", "priority": 5}, {"id": "a2", "priority": 5}]
    b = [{"id": "b1", "priority": 5}, {"id": "b2", "priority": 5}]
    result = merge_sorted(a, b, key=lambda x: x["priority"])
    ids = [item["id"] for item in result]
    assert ids == ["a1", "a2", "b1", "b2"], (
        f"Expected a's elements before b's when priorities are equal, got: {ids}"
    )


def test_sort_preserves_insertion_order_for_equal_priority():
    # Tasks submitted at the same priority level should be processed
    # in the order they were submitted.
    tasks = [
        {"name": "task-3", "priority": 2},
        {"name": "task-1", "priority": 1},
        {"name": "task-4", "priority": 2},
        {"name": "task-2", "priority": 1},
        {"name": "task-5", "priority": 3},
    ]
    result = sort_by_priority(tasks)
    names = [t["name"] for t in result]
    # priority 1: task-1, task-2 (original order)
    # priority 2: task-3, task-4 (original order)
    # priority 3: task-5
    assert names == ["task-1", "task-2", "task-3", "task-4", "task-5"], (
        f"Expected stable sort by priority, got: {names}"
    )
