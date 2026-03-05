"""Hidden oracle tests — copied into workspace after agent finishes."""
import base64
import json

import pytest
from config import init_service, load_config

# ---------------------------------------------------------------------------
# Fixtures (same as visible test, kept self-contained)
# ---------------------------------------------------------------------------

DEFAULTS = {
    "rate_limit": "20/min",
    "cache_ttl": "2m",
    "log_level": "INFO",
    "max_connections": "50",
    "region": "us-east-1",
}

ENV_OVERRIDES = {
    "rate_limit": "10/s",
    "log_level": "DEBUG",
    "max_connections": "200",
}

FILE_OVERRIDES = {
    "rate_limit": "50/min",
    "cache_ttl": "10m",
    "log_level": "WARNING",
    "max_connections": "100",
}

EXPECTED_MAX_RPS = 50 / 60  # ≈ 0.8333


# ---------------------------------------------------------------------------
# Priority: file > env > defaults
# ---------------------------------------------------------------------------


def test_file_wins_over_env_rate_limit():
    service = init_service(DEFAULTS, ENV_OVERRIDES, FILE_OVERRIDES)
    assert abs(service["max_rps"] - EXPECTED_MAX_RPS) < 0.01, (
        f"max_rps should be {EXPECTED_MAX_RPS:.4f} (file '50/min'), got {service['max_rps']:.4f}"
    )


def test_file_wins_over_env_log_level():
    service = init_service(DEFAULTS, ENV_OVERRIDES, FILE_OVERRIDES)
    assert service["log_level"] == "WARNING"


def test_file_wins_over_env_max_connections():
    service = init_service(DEFAULTS, ENV_OVERRIDES, FILE_OVERRIDES)
    assert service["max_connections"] == 100, (
        f"max_connections should be 100 (file), got {service['max_connections']}"
    )


def test_env_wins_over_defaults():
    """Values in env_overrides not overridden by file_overrides should use env value."""
    # max_connections is in both env and file — file wins
    # log_level is in both — file wins
    # Neither source sets region — falls through to defaults
    service = init_service(DEFAULTS, ENV_OVERRIDES, {})
    # With empty file_overrides, env should win over defaults for rate_limit
    # env: "10/s" -> max_rps = 10/1 = 10.0
    assert abs(service["max_rps"] - 10.0) < 0.01, (
        f"With no file config, env rate_limit '10/s' should give max_rps=10.0, got {service['max_rps']}"
    )


def test_defaults_used_when_no_overrides():
    service = init_service(DEFAULTS, {}, {})
    # Default rate: "20/min" -> 20/60 ≈ 0.333
    assert abs(service["max_rps"] - 20 / 60) < 0.01


def test_file_only_no_env():
    service = init_service(DEFAULTS, {}, FILE_OVERRIDES)
    assert abs(service["max_rps"] - EXPECTED_MAX_RPS) < 0.01


# ---------------------------------------------------------------------------
# Transform correctness
# ---------------------------------------------------------------------------


def test_cache_ttl_from_file():
    service = init_service(DEFAULTS, ENV_OVERRIDES, FILE_OVERRIDES)
    # File sets "10m" -> 600 seconds
    assert service["cache_ttl"] == 600, f"Expected 600s for '10m', got {service['cache_ttl']}"


def test_feature_flags_transform():
    flags = {"dark_mode": True, "new_dashboard": False}
    encoded = base64.b64encode(json.dumps(flags).encode()).decode()
    service = init_service(
        DEFAULTS,
        {"feature_flags": encoded},
        {},
    )
    assert service["features"] == flags


def test_region_comes_from_defaults_when_not_overridden():
    service = init_service(DEFAULTS, ENV_OVERRIDES, FILE_OVERRIDES)
    assert service["config"]["region"] == "us-east-1"


# ---------------------------------------------------------------------------
# load_config directly
# ---------------------------------------------------------------------------


def test_load_config_priority_order():
    """Directly verify merge priority: file > env > defaults.

    Uses rate_limit (a registered transform) so values get parsed to dicts
    and we can inspect the 'count' field to confirm which source won.
    """
    result = load_config(
        defaults={"rate_limit": "1/min", "cache_ttl": "1m", "log_level": "DEBUG"},
        env_overrides={"rate_limit": "2/min", "cache_ttl": "2m"},
        file_overrides={"rate_limit": "3/min"},
    )
    # rate_limit in all three sources — file wins (count == 3)
    assert result["rate_limit"]["count"] == 3, (
        f"File should win for rate_limit, got count={result['rate_limit']['count']}"
    )
    # cache_ttl in env and defaults — env wins (2 minutes = 120s)
    assert result["cache_ttl"] == 120, (
        f"Env should win for cache_ttl, got {result['cache_ttl']}"
    )
    # log_level only in defaults — default used
    assert result["log_level"] == "DEBUG", (
        f"Default should be used for log_level, got {result['log_level']!r}"
    )
