"""Service configuration loader.

Loads and merges configuration from three sources with a defined priority:
    defaults < env_vars < config_file

The config_file takes highest priority (most specific), env_vars are
intermediate, and defaults are the fallback.

Configuration values pass through a transform registry that normalizes
them into structured types. For example:
    "100/min"  -> {"count": 100, "window": 60}   (rate limit)
    "5m"       -> 300                              (TTL in seconds)
    base64-JSON -> decoded dict                    (feature flags)

Usage:
    service = init_service(defaults, env_overrides, file_overrides)
    assert service["max_rps"] == expected_rate
"""

import base64
import hashlib
import json

# ---------------------------------------------------------------------------
# Transform registry
# ---------------------------------------------------------------------------

# Registry maps schema_version -> {config_key -> transform_fn}
_TRANSFORMS: dict[str, dict[str, object]] = {}


def _register(version: str, key: str):
    """Decorator: register a transform function for a config key + schema version."""
    def decorator(fn):
        _TRANSFORMS.setdefault(version, {})[key] = fn
        return fn
    return decorator


@_register("v2", "rate_limit")
def _transform_rate_limit(raw: str) -> dict:
    """Normalize rate limit string: '100/min' -> {'count': 100, 'window': 60}."""
    unit_seconds = {"s": 1, "sec": 1, "min": 60, "m": 60, "hr": 3600, "h": 3600}
    parts = str(raw).split("/")
    if len(parts) != 2:
        raise ValueError(f"Invalid rate_limit format: {raw!r}. Expected 'N/unit'.")
    count = int(parts[0])
    unit = parts[1].strip().lower()
    window = unit_seconds.get(unit)
    if window is None:
        raise ValueError(f"Unknown time unit: {unit!r}")
    return {"count": count, "window": window}


@_register("v2", "feature_flags")
def _transform_feature_flags(raw) -> dict:
    """Decode feature flags: base64-encoded JSON string or plain dict."""
    if isinstance(raw, str):
        try:
            decoded = base64.b64decode(raw.encode()).decode()
            return json.loads(decoded)
        except Exception as exc:
            raise ValueError(f"Invalid feature_flags encoding: {exc}") from exc
    if isinstance(raw, dict):
        return raw
    raise ValueError(f"Unexpected feature_flags type: {type(raw).__name__}")


@_register("v2", "cache_ttl")
def _transform_cache_ttl(raw) -> int:
    """Parse cache TTL: '5m' -> 300, '2h' -> 7200, '30' -> 30 (seconds)."""
    unit_map = {"d": 86400, "h": 3600, "m": 60, "s": 1}
    s = str(raw).strip()
    for suffix, mult in sorted(unit_map.items(), key=lambda x: -len(x[0])):
        if s.endswith(suffix):
            return int(s[: -len(suffix)]) * mult
    return int(s)


@_register("v2", "api_key")
def _transform_api_key(raw: str) -> str:
    """Validate and normalize API key: must be 32+ alphanumeric characters."""
    key = str(raw).strip()
    if len(key) < 32 or not key[:32].isalnum():
        raise ValueError(f"Invalid API key format (first 8 chars): {key[:8]!r}")
    return key


@_register("v2", "log_level")
def _transform_log_level(raw: str) -> str:
    """Normalize log level to uppercase."""
    level = str(raw).strip().upper()
    valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    if level not in valid:
        raise ValueError(f"Invalid log_level {level!r}. Valid: {valid}")
    return level


@_register("v2", "max_connections")
def _transform_max_connections(raw) -> int:
    """Parse max_connections as a positive integer."""
    val = int(raw)
    if val <= 0:
        raise ValueError(f"max_connections must be positive, got {val}")
    return val


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


def _apply_transforms(data: dict, schema_version: str = "v2") -> dict:
    """Apply registered transforms to all known config keys."""
    transforms = _TRANSFORMS.get(schema_version, {})
    result = {}
    for key, value in data.items():
        if key in transforms:
            result[key] = transforms[key](value)  # type: ignore[operator]
        else:
            result[key] = value
    return result


def load_config(defaults: dict, env_overrides: dict, file_overrides: dict, schema_version: str = "v2") -> dict:
    """Merge configuration sources with priority: file_overrides > env_overrides > defaults.

    Each source is merged on top of the previous one, so later sources win.
    All values from all three sources are transformed before merging.

    Args:
        defaults:       Base configuration values (lowest priority).
        env_overrides:  Values from environment variables (middle priority).
        file_overrides: Values from config file (highest priority).
        schema_version: Which transform registry version to use.

    Returns:
        Merged and transformed configuration dict.
    """
    # BUG: env_overrides and file_overrides are applied in the wrong order.
    # Current: defaults <- file_overrides <- env_overrides  (env wins, WRONG)
    # Correct: defaults <- env_overrides  <- file_overrides (file wins, RIGHT)
    merged = {**_apply_transforms(defaults, schema_version)}
    merged.update(_apply_transforms(file_overrides, schema_version))   # should be env first
    merged.update(_apply_transforms(env_overrides, schema_version))    # should be file last
    return merged


# ---------------------------------------------------------------------------
# Service initialization
# ---------------------------------------------------------------------------


def compute_cache_key(config: dict) -> str:
    """Generate a deterministic cache key from a subset of config values."""
    relevant = {
        "rate_limit": config.get("rate_limit"),
        "cache_ttl": config.get("cache_ttl"),
        "region": config.get("region"),
    }
    raw = json.dumps(relevant, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def init_service(defaults: dict, env_overrides: dict, file_overrides: dict) -> dict:
    """Initialize the service with merged configuration.

    Returns a service descriptor with:
        config      : merged configuration dict
        cache_key   : deterministic identifier for this config combination
        max_rps     : requests per second limit (from rate_limit config)
        cache_ttl   : cache time-to-live in seconds
        features    : feature flags dict
        log_level   : normalized log level string
    """
    config = load_config(defaults, env_overrides, file_overrides)

    rate_limit = config.get("rate_limit")
    if rate_limit is None:
        max_rps = None
    elif isinstance(rate_limit, dict):
        max_rps = rate_limit["count"] / rate_limit["window"]
    else:
        raise TypeError(f"Unexpected rate_limit type after transform: {type(rate_limit)}")

    return {
        "config": config,
        "cache_key": compute_cache_key(config),
        "max_rps": max_rps,
        "cache_ttl": config.get("cache_ttl"),
        "features": config.get("feature_flags", {}),
        "log_level": config.get("log_level", "INFO"),
        "max_connections": config.get("max_connections"),
    }
