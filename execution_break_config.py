import json
import logging
import pathlib
from typing import FrozenSet

from .define import define

logger = logging.getLogger(define.logger_name)

_SETTINGS_PATH = pathlib.Path(__file__).parent / "ds_settings.json"

DEFAULT_EXECUTION_BREAK_NODE_TYPES: FrozenSet[str] = frozenset(
    {
        "KSampler",
        "KSamplerAdvanced",
        "SamplerCustom",
        "SamplerCustomAdvanced",
        "ImageUpscaleWithModel",
        "VAEDecode",
        "VAEEncode",
        "VAEDecodeTiled",
        "VAEEncodeTiled",
        "VAEEncodeForInpaint",
        "LatentUpscale",
        "LatentUpscaleBy",
        "SeedVR2VideoUpscaler",
    }
)

_SETTINGS_SECONDS_KEY = "iterator_execution_break_seconds"
_SETTINGS_EXTRA_TYPES_KEY = "iterator_execution_break_extra_node_types"


def _parse_extra_node_types(raw: object) -> set[str]:
    if isinstance(raw, list):
        return {str(x).strip() for x in raw if str(x).strip()}
    if isinstance(raw, str) and raw.strip():
        return {part.strip() for part in raw.split(",") if part.strip()}
    return set()


def read_execution_break_settings() -> tuple[float, FrozenSet[str]]:
    seconds = 0.0
    extra: set[str] = set()
    try:
        with open(_SETTINGS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        raw_seconds = data.get(_SETTINGS_SECONDS_KEY, 0.0)
        seconds = max(0.0, float(raw_seconds))
        extra = _parse_extra_node_types(data.get(_SETTINGS_EXTRA_TYPES_KEY, ""))
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.debug("Execution break settings read failed: %s", exc)
    allowlist = frozenset(DEFAULT_EXECUTION_BREAK_NODE_TYPES | extra)
    return seconds, allowlist
