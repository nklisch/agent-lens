"""Visible failing test — agent can see and run this."""
from process_items import process_items, summarize


def test_all_items_processed():
    items = ["apple", "banana", "cherry"]
    result = process_items(items)
    assert len(result) == 3, f"Expected 3 items processed, got {len(result)}: {result}"
    assert result == ["APPLE", "BANANA", "CHERRY"], f"Got {result}"


def test_summarize_count():
    summary = summarize(["one", "two", "three", "four"])
    assert summary["count"] == 4, f"Expected count=4, got {summary['count']}"
