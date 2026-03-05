"""Hidden oracle tests — copied into workspace after agent finishes."""
import pytest
from discount import calculate_discount, process_order


def test_gold_discount_rate():
    assert calculate_discount("gold", 100.0) == pytest.approx(10.0), "Gold rate should be 10%"


def test_all_tiers_reasonable():
    """No tier should discount more than 25%."""
    for tier in ["bronze", "silver", "gold", "platinum"]:
        rate = calculate_discount(tier, 100.0)
        assert 0 <= rate <= 25, f"{tier} discount {rate} is unreasonable (expected 0–25)"


def test_gold_order_total():
    """Gold order: subtotal=149.97, discount=14.997, tax=14.997 → total≈149.97."""
    total = process_order("gold", [49.99, 49.99, 49.99])
    assert 130 < total < 170, f"Gold order total {total:.2f} is wrong (expected ~150)"


def test_bronze_unchanged():
    """Bronze tier should still work correctly."""
    total = process_order("bronze", [100.0])
    # subtotal=100, discount=5, tax=10, total=105
    assert total == pytest.approx(105.0), f"Bronze total should be 105.0, got {total}"
