"""Multi-source configuration for the order processing system.

Configuration is loaded in layers:
  1. Default config (hardcoded defaults)
  2. Encoded pricing config (base64-encoded JSON with discount strategies)
  3. Override config (from JSON file or dict)

Layers are merged using deep_merge(), which recursively combines dicts.
"""

import base64
import json
import logging
from typing import Any

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Encoded pricing configuration
#
# Contains discount strategy name mappings for product categories.
# The strategy name must match a key in DISCOUNT_STRATEGIES in pricing_service.py.
# ---------------------------------------------------------------------------

_ENCODED_PRICING_CONFIG = base64.b64encode(json.dumps({
    "pricing": {
        "strategies": {
            "electronics": "percent",
            "accessories": "fixed_amount",
            "services": "tiered",
        },
        "tax_rate": 0.08,
    }
}).encode()).decode()

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------

_DEFAULT_CONFIG: dict[str, Any] = {
    "discount_rules": [
        {"type": "loyalty", "tier": "gold", "rate": 0.05},
    ],
    "shipping": {
        "base_rate": 5.99,
        "per_kg_rate": 0.50,
        "free_threshold": 100.0,
    },
    "inventory": {
        "low_stock_threshold": 5,
        "reserve_on_order": True,
    },
}

# Override config — simulates a JSON config file loaded at startup.
# In production this would be read from disk; here it's inline for testing.
_OVERRIDE_CONFIG: dict[str, Any] = {
    "discount_rules": [
        {"type": "loyalty", "tier": "gold", "rate": 0.10},
    ],
}

_config: dict[str, Any] = {}
_loaded = False


def deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into base.

    For dict values: recursively merge.
    For list values: concatenate (base + override).
    For all other values: override replaces base.
    """
    result = base.copy()
    for key, value in override.items():
        if key in result:
            if isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = deep_merge(result[key], value)
            elif isinstance(result[key], list) and isinstance(value, list):
                result[key] = result[key] + value
            else:
                result[key] = value
        else:
            result[key] = value
    return result


def load_config() -> dict[str, Any]:
    """Load and merge all configuration layers.

    Returns the fully merged configuration dict.
    """
    global _config, _loaded

    # Start with defaults
    cfg = _DEFAULT_CONFIG.copy()

    # Merge encoded pricing config
    pricing_raw = json.loads(base64.b64decode(_ENCODED_PRICING_CONFIG))
    cfg = deep_merge(cfg, pricing_raw)

    # Merge override config
    cfg = deep_merge(cfg, _OVERRIDE_CONFIG)

    _config = cfg
    _loaded = True
    return _config


def get_config() -> dict[str, Any]:
    """Return the current configuration. Loads if not yet loaded."""
    if not _loaded:
        load_config()
    return _config


def get_discount_rules() -> list[dict]:
    """Return the active discount rules."""
    return get_config().get("discount_rules", [])


def get_pricing_strategies() -> dict[str, str]:
    """Return the category → strategy name mapping from encoded config."""
    return get_config().get("pricing", {}).get("strategies", {})


def get_tax_rate() -> float:
    """Return the configured tax rate."""
    return get_config().get("pricing", {}).get("tax_rate", 0.08)
