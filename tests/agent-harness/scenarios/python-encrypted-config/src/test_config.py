"""Visible failing test — agent can see and run this.

Tests that config file values take priority over env-var values.
The config file should win when both sources provide the same key.
"""
import base64
import json

from config import init_service

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

# Default config (lowest priority)
DEFAULTS = {
    "rate_limit": "20/min",
    "cache_ttl": "2m",
    "log_level": "INFO",
    "max_connections": "50",
    "region": "us-east-1",
}

# Environment variables (middle priority — from a .env scan or CI environment).
# A leftover env var from a previous deployment sets rate_limit to "10/s".
ENV_OVERRIDES = {
    "rate_limit": "10/s",   # leftover from a load-test run
    "log_level": "DEBUG",   # someone left debug logging on
    "max_connections": "200",
}

# Config file (highest priority — the authoritative deployment config).
# This explicitly sets rate_limit to the production value.
FILE_OVERRIDES = {
    "rate_limit": "50/min",   # production rate limit: 50 req/min ≈ 0.833 req/s
    "cache_ttl": "10m",
    "log_level": "WARNING",
    "max_connections": "100",
}

# Expected max_rps from file config: 50 requests / 60 seconds
EXPECTED_MAX_RPS = 50 / 60  # ≈ 0.8333


def test_file_config_rate_limit_takes_priority():
    """Config file should override env var for rate_limit."""
    service = init_service(DEFAULTS, ENV_OVERRIDES, FILE_OVERRIDES)
    assert abs(service["max_rps"] - EXPECTED_MAX_RPS) < 0.01, (
        f"Expected max_rps ≈ {EXPECTED_MAX_RPS:.4f} (from file config '50/min'), "
        f"got {service['max_rps']:.4f}. "
        f"The env var '10/s' should not override the file config '50/min'."
    )


def test_file_config_log_level_takes_priority():
    """Config file log level should override env var."""
    service = init_service(DEFAULTS, ENV_OVERRIDES, FILE_OVERRIDES)
    assert service["log_level"] == "WARNING", (
        f"Expected log_level=WARNING (from file config), got {service['log_level']!r}"
    )
