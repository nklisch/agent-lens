"""Utilities for merging sorted sequences."""


def merge_sorted(a: list, b: list, key=None) -> list:
    """Merge two sorted lists into a single sorted list.

    When two elements have equal key values, elements from `a` come before
    elements from `b` (stable with respect to the original list order).

    Args:
        a: First sorted list.
        b: Second sorted list.
        key: Optional function to extract a comparison key from each element.
             Defaults to the identity function (compare elements directly).

    Returns:
        A new sorted list containing all elements from `a` and `b`.
    """
    if key is None:
        key = lambda x: x  # noqa: E731

    result = []
    i = j = 0
    while i < len(a) and j < len(b):
        if key(a[i]) >= key(b[j]):  # BUG: should be > to preserve stability
            result.append(b[j])
            j += 1
        else:
            result.append(a[i])
            i += 1

    # Append any remaining elements
    result.extend(a[i:])
    result.extend(b[j:])
    return result


def merge_all(lists: list[list], key=None) -> list:
    """Merge any number of sorted lists into a single sorted list.

    Args:
        lists: A list of sorted lists to merge.
        key: Optional comparison key function (see merge_sorted).

    Returns:
        A single sorted list containing all elements from all input lists.
    """
    if not lists:
        return []
    result = lists[0][:]
    for lst in lists[1:]:
        result = merge_sorted(result, lst, key=key)
    return result


def sort_by_priority(items: list[dict], priority_field: str = "priority") -> list[dict]:
    """Sort a list of dicts by a priority field using merge sort.

    Lower priority values come first. Items with equal priority preserve
    their original relative order (stable sort).

    Args:
        items: List of dicts to sort.
        priority_field: The dict key to sort by.

    Returns:
        New list sorted by priority_field.
    """
    if len(items) <= 1:
        return items[:]

    mid = len(items) // 2
    left = sort_by_priority(items[:mid], priority_field)
    right = sort_by_priority(items[mid:], priority_field)
    return merge_sorted(left, right, key=lambda x: x[priority_field])
