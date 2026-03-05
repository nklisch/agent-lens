"""Hidden oracle tests — copied into workspace after agent finishes."""
import pytest
from process_items import process_items, summarize


def test_single_item():
    result = process_items(["hello"])
    assert result == ["HELLO"], f"Single item failed: {result}"


def test_all_items_processed():
    items = ["apple", "banana", "cherry"]
    result = process_items(items)
    assert len(result) == 3, f"Expected 3, got {len(result)}: {result}"
    assert result == ["APPLE", "BANANA", "CHERRY"]


def test_empty_list():
    assert process_items([]) == []


def test_whitespace_stripped():
    result = process_items(["  hello  ", "  world  "])
    assert result == ["HELLO", "WORLD"], f"Whitespace stripping failed: {result}"


def test_summarize_count_multiple():
    for n in range(1, 6):
        items = [f"item{i}" for i in range(n)]
        summary = summarize(items)
        assert summary["count"] == n, f"summarize({n} items) returned count={summary['count']}"


def test_last_item_not_skipped():
    """Regression: confirm the off-by-one is fixed."""
    items = ["a", "b", "c", "d", "e"]
    result = process_items(items)
    assert result[-1] == "E", f"Last item 'e' was not processed — got result: {result}"
