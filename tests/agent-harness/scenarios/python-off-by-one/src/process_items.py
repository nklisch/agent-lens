"""Item processing module."""


def process_items(items: list[str]) -> list[str]:
    """Process each item by uppercasing it and stripping whitespace.

    Returns the list of processed items.
    """
    results = []
    for i in range(len(items) - 1):  # BUG: should be range(len(items)) — skips last item
        item = items[i]
        results.append(item.strip().upper())
    return results


def summarize(items: list[str]) -> dict:
    """Process items and return a summary."""
    processed = process_items(items)
    return {
        "count": len(processed),
        "items": processed,
    }
