"""Output formatting and rounding for analytics results.

Produces human-readable reports and machine-readable summaries from
MetricResult objects. Handles locale-specific number formatting and
currency symbol placement.
"""

from models import MetricResult


CURRENCY_SYMBOLS: dict[str, str] = {
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "JPY": "¥",
    "CAD": "CA$",
}


def format_currency(value: float, currency: str) -> str:
    """Format a numeric value as a currency string.

    Args:
        value: The amount to format.
        currency: ISO 4217 currency code.

    Returns:
        Formatted string like "$1,234.56" or "€1.234,56".
    """
    symbol = CURRENCY_SYMBOLS.get(currency, currency + " ")
    # Use standard US-style formatting for all currencies in this context
    formatted = f"{value:,.2f}"
    return f"{symbol}{formatted}"


def format_metric_result(result: MetricResult) -> str:
    """Return a single-line formatted metric result.

    Args:
        result: The MetricResult to format.

    Returns:
        Human-readable string like "avg_revenue_per_unit: €10.23 (n=8)".
    """
    value_str = format_currency(result.value, result.currency)
    return f"{result.metric_name}: {value_str} (n={result.event_count})"


def format_report(results: list[MetricResult], title: str = "Analytics Report") -> str:
    """Return a multi-line formatted report for a set of metric results.

    Args:
        results: List of MetricResult objects to include.
        title: Report header title.

    Returns:
        Multi-line report string.
    """
    separator = "=" * 50
    lines = [
        separator,
        f"  {title}",
        separator,
    ]

    if not results:
        lines.append("  No results.")
    else:
        max_name_len = max(len(r.metric_name) for r in results)
        for result in results:
            name_padded = result.metric_name.ljust(max_name_len)
            value_str = format_currency(result.value, result.currency)
            lines.append(f"  {name_padded}  {value_str:>15}  (n={result.event_count})")

    lines.append(separator)
    return "\n".join(lines)


def round_result(value: float, decimals: int = 2) -> float:
    """Round a metric result to the specified number of decimal places.

    Uses Python's built-in round() which applies banker's rounding
    (round half to even) to minimize systematic bias.

    Args:
        value: The value to round.
        decimals: Number of decimal places.

    Returns:
        Rounded value.
    """
    return round(value, decimals)


def summarize_results(results: list[MetricResult]) -> dict[str, float]:
    """Return a plain dict of metric_name → rounded value.

    Useful for test assertions and machine-readable output.

    Args:
        results: List of MetricResult objects.

    Returns:
        Dict mapping each metric name to its rounded value.
    """
    return {r.metric_name: round_result(r.value) for r in results}
