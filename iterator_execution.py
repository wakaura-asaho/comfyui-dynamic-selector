import asyncio
import contextvars
import logging
import time
from typing import Any

import comfy.model_management as model_management

from .define import define
from .execution_break_config import read_execution_break_settings

logger = logging.getLogger(define.logger_name)

_dynprompt_var: contextvars.ContextVar[Any | None] = contextvars.ContextVar(
    "dynamic_selector_dynprompt", default=None
)
_patched = False


def _node_class_type(dynprompt: Any, unique_id: str) -> str:
    if dynprompt is None or not dynprompt.has_node(unique_id):
        return ""
    return str(dynprompt.get_node(unique_id).get("class_type", ""))


async def _sleep_execution_break(seconds: float) -> None:
    if seconds <= 0:
        return
    deadline = time.monotonic() + seconds
    while True:
        model_management.throw_exception_if_processing_interrupted()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        await asyncio.sleep(min(0.05, remaining))


def _needs_paced_list_map(obj: Any, input_data_all: dict) -> bool:
    if getattr(obj, "INPUT_IS_LIST", False):
        return False
    if not input_data_all:
        return False
    max_len = max(len(x) for x in input_data_all.values())
    return max_len > 1


def install_execution_break_hook() -> None:
    global _patched
    if _patched:
        return
    import execution

    orig_execute = execution.execute
    orig_map = execution._async_map_node_over_list

    async def execute_with_dynprompt(
        server,
        dynprompt,
        caches,
        current_item,
        extra_data,
        executed,
        prompt_id,
        execution_list,
        pending_subgraph_results,
        pending_async_nodes,
        ui_outputs,
        asset_manager,
    ):
        token = _dynprompt_var.set(dynprompt)
        try:
            return await orig_execute(
                server,
                dynprompt,
                caches,
                current_item,
                extra_data,
                executed,
                prompt_id,
                execution_list,
                pending_subgraph_results,
                pending_async_nodes,
                ui_outputs,
                asset_manager,
            )
        finally:
            _dynprompt_var.reset(token)

    async def map_with_execution_break(
        prompt_id,
        unique_id,
        obj,
        input_data_all,
        func,
        allow_interrupt=False,
        execution_block_cb=None,
        pre_execute_cb=None,
        v3_data=None,
    ):
        if not _needs_paced_list_map(obj, input_data_all):
            return await orig_map(
                prompt_id,
                unique_id,
                obj,
                input_data_all,
                func,
                allow_interrupt=allow_interrupt,
                execution_block_cb=execution_block_cb,
                pre_execute_cb=pre_execute_cb,
                v3_data=v3_data,
            )
        pause_seconds, allowlist = read_execution_break_settings()
        dynprompt = _dynprompt_var.get()
        class_type = _node_class_type(dynprompt, unique_id)
        if pause_seconds <= 0 or class_type not in allowlist:
            return await orig_map(
                prompt_id,
                unique_id,
                obj,
                input_data_all,
                func,
                allow_interrupt=allow_interrupt,
                execution_block_cb=execution_block_cb,
                pre_execute_cb=pre_execute_cb,
                v3_data=v3_data,
            )
        max_len_input = max(len(x) for x in input_data_all.values())
        results: list[Any] = []
        for i in range(max_len_input):
            if i > 0:
                await _sleep_execution_break(pause_seconds)
            single = {
                k: [v[i if len(v) > i else -1]] for k, v in input_data_all.items()
            }
            chunk = await orig_map(
                prompt_id,
                unique_id,
                obj,
                single,
                func,
                allow_interrupt=allow_interrupt,
                execution_block_cb=execution_block_cb,
                pre_execute_cb=pre_execute_cb,
                v3_data=v3_data,
            )
            results.extend(chunk)
        return results

    execution.execute = execute_with_dynprompt
    execution._async_map_node_over_list = map_with_execution_break
    _patched = True
    logger.debug("Installed iterator execution-break hook.")
