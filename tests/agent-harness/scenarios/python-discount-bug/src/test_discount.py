"""Visible failing test — agent can see and run this."""
from discount import process_order


def test_gold_discount_is_ten_percent():
    # Gold tier should give a 10% discount, not 100%.
    # With subtotal=100.0: discount=10.0, tax=10.0, total=100.0
    total = process_order("gold", [100.0])
    assert total == 100.0, f"Expected 100.0 (10% discount), got {total}"
