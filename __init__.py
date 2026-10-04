import json
import os
import pathlib
import folder_paths
import logging
from comfy_api.latest import ComfyExtension, io
from .dynamic_selector import WeightedRandomizer, DynamicGroup, DynamicGroupSelector, DynamicTypeSelector, DynamicCombo
from .dynamic_iterator import FloatIterator, IntIterator, StringIterator
from .define import define
from .execution_break_config import DEFAULT_EXECUTION_BREAK_NODE_TYPES
from .iterator_execution import install_execution_break_hook

logger = logging.getLogger(define.logger_name)

folder_paths.add_model_folder_path(define.author, os.path.join(folder_paths.models_dir, define.author))

WEB_DIRECTORY = "./web"
__all__ = ['WEB_DIRECTORY']

class DynamicSelectorExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            FloatIterator,
            IntIterator,
            StringIterator,
            WeightedRandomizer,
            DynamicGroup,
            DynamicGroupSelector,
            DynamicTypeSelector,
            DynamicCombo
        ]

async def comfy_entrypoint() -> DynamicSelectorExtension:
    return DynamicSelectorExtension()

_SETTINGS_PATH = pathlib.Path(__file__).parent / "ds_settings.json"

def _read_settings_json() -> dict:
    with open(_SETTINGS_PATH, encoding="utf-8") as f:
        return json.load(f)

def _write_settings_json(data: dict) -> None:
    with open(_SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

def _setup_settings_api() -> None:
    try:
        from aiohttp import web
        from server import PromptServer

        settings_path = "/api/wakaura/dynamic-selector/settings"
        defaults_path = "/api/wakaura/dynamic-selector/execution-break-defaults"

        @PromptServer.instance.routes.get(defaults_path)
        async def get_execution_break_defaults(_request):
            return web.json_response(
                {"default_node_types": sorted(DEFAULT_EXECUTION_BREAK_NODE_TYPES)}
            )

        @PromptServer.instance.routes.get(settings_path)
        async def get_dynamic_selector_settings(request):
            data = _read_settings_json()
            data["max_inputs"] = define.max_inputs
            return web.json_response(data)

        @PromptServer.instance.routes.post(settings_path)
        async def post_dynamic_selector_settings(request):
            try:
                patch = await request.json()
                current = _read_settings_json()
                current.update({
                    k: v
                    for k, v in patch.items()
                    if not k.startswith("_comment") and k != "max_inputs"
                })
                _write_settings_json(current)
                return web.json_response({"status": "ok"})
            except Exception as exc:
                return web.json_response({"status": "error", "error": str(exc)}, status=400)
    except Exception as exc:
        logger.error(f"Could not register settings API: {exc}")

_setup_settings_api()

try:
    install_execution_break_hook()
except Exception as exc:
    logger.error(f"Could not install iterator execution-break hook: {exc}")