from comfy_api.latest import io
import re
import logging
from .define import define

logger = logging.getLogger("DynamicSelector")


class DynamicGroup(io.ComfyNode):
    """
    Collect a set of inputs with the same type into a group.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DynamicGroup",
            display_name="Dynamic Group",
            description="Collect a set of inputs with the same type into a group.",
            category=define.author,
            is_experimental=True,
            inputs=[SchemaDefineHelper.dynamic_input()],
            outputs=[
                io.Custom("GROUP").Output(
                    id="group_output",
                    display_name="GROUP_OUTPUT",
                    # is_output_list=True
                    # If set to true, the list will be unpacked, iterating each item through the execution calls
                ),
            ],
            accept_all_inputs=True,
        )

    @staticmethod
    def _determine_comfy_type(obj) -> str:
        """
        Determine the ComfyUI type string for a given object.
        Based on comfy_api.latest._io.__all__
        """
        if obj is None:
            return "*"

        # dict
        if isinstance(obj, dict):
            if "samples" in obj:
                return "LATENT"
            if "waveform" in obj:
                return "AUDIO"
            if "loss" in obj:
                return "LOSS_MAP"
            if "accum" in obj:
                return "ACCUMULATION"
            if "image" in obj and "camera_info" in obj:
                return "LOAD_3D"
            if "position" in obj and "target" in obj:
                return "LOAD3D_CAMERA"
            return "DICT"

        # list
        if isinstance(obj, list):
            if len(obj) > 0:
                # Conditioning: list[tuple[torch.Tensor, dict]]
                first = obj[0]
                if isinstance(first, (list, tuple)) and len(first) == 2:
                    if hasattr(first[0], "shape") and isinstance(first[1], dict):
                        return "CONDITIONING"
            return "LIST"

        # primitives
        if isinstance(obj, bool):
            return "BOOLEAN"
        if isinstance(obj, int):
            return "INT"
        if isinstance(obj, float):
            return "FLOAT"
        if isinstance(obj, str):
            return "STRING"

        # torch/comfy exclusive
        obj_type = type(obj).__name__

        # tensor
        if obj_type == "Tensor":
            if hasattr(obj, "shape"):
                if len(obj.shape) == 4:
                    return "IMAGE"
                if len(obj.shape) == 3:
                    return "MASK"
            return "TENSOR"

        # class name mapping
        class_to_io_type = {
            "ModelPatcher": "MODEL",
            "CLIP": "CLIP",
            "VAE": "VAE",
            "ControlNet": "CONTROL_NET",
            "Sampler": "SAMPLER",
            "CFGGuider": "GUIDER",
            "ClipVisionModel": "CLIP_VISION",
            "StyleModel": "STYLE_MODEL",
            "ImageModelDescriptor": "UPSCALE_MODEL",
            "VideoInput": "VIDEO",
            "HookGroup": "HOOKS",
            "HookKeyframeGroup": "HOOK_KEYFRAMES",
            "MESH": "MESH",
            "VOXEL": "VOXEL",
            "SVG": "SVG",
            "File3D": "FILE_3D",
            "ExecutionBlocker": "EXECUTION_BLOCKER",
        }

        if obj_type in class_to_io_type:
            return class_to_io_type[obj_type]

        return obj_type.upper()

    @classmethod
    def execute(cls, **kwargs) -> io.NodeOutput:
        """Pack all connected input_N values into an ordered list (the group)."""
        items = []
        item_type = "unknown"
        if kwargs and len(kwargs) > 0:
            idx = 0
            while True:
                key = f"input_{idx}"
                if key not in kwargs:
                    break
                val = kwargs[key]
                items.append(val)
                if idx == 0:
                    item_type = cls._determine_comfy_type(val)
                idx += 1
        return io.NodeOutput({"data": items, "type": item_type})


class DynamicGroupSelector(io.ComfyNode):
    """
    Select an item from a dynamic group.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DynamicGroupSelector",
            display_name="Dynamic Group Selector",
            category=define.author,
            is_experimental=True,
            description="Select an item from a dynamic group.",
            inputs=[
                SchemaDefineHelper.selection_input(
                    id="select_group",
                    tooltip="Zero-based index of which GROUP input to select.",
                ),
                SchemaDefineHelper.selection_input(
                    id="index",
                    tooltip="Zero-based index of the item to select from within the chosen group.",
                ),
                io.Boolean.Input(
                    id="type_strict",
                    display_name="Type Strict",
                    tooltip="If different types of data get passed into the node, raise an error.",
                ),
                io.Custom("GROUP").Input(id="input_0", display_name="input_0"),
            ],
            outputs=[SchemaDefineHelper.dynamic_output()],
            accept_all_inputs=True,
        )

    @classmethod
    def _check_type_consistency(cls, **kwargs) -> bool | str:
        """
        Verify that all connected dynamic inputs have a consistent underlying type.
        """
        first_type = None
        first_key = None

        # Identify and sort all input_N keys
        input_keys = sorted([k for k in kwargs.keys() if k.startswith("input_")])

        for key in input_keys:
            val = kwargs[key]
            if val is None:
                continue

            if isinstance(val, dict) and "type" in val:
                current_type = val["type"]
            else:
                current_type = DynamicGroup._determine_comfy_type(val)

            if first_type is None:
                first_type = current_type
                first_key = key
            elif current_type != first_type:
                raise TypeError(
                    f"DynamicGroupSelector: Inconsistent types: {key} is '{current_type}', but {first_key} is '{first_type}'."
                )

        return True

    @classmethod
    def fingerprint_inputs(
        cls, select_group: int, index: int, type_strict: bool, **kwargs
    ) -> tuple[int, int]:
        return (select_group, index)

    @classmethod
    def validate_inputs(
        cls, select_group: int, index: int, type_strict: bool, **kwargs
    ) -> bool | str:
        group_key = f"input_{select_group}"
        if group_key not in kwargs:
            return (
                f"Input '{group_key}' must be connected for selection {select_group}."
            )

        return True

    @classmethod
    def execute(
        cls, select_group: int, index: int, type_strict: bool, **kwargs
    ) -> io.NodeOutput:
        """Return the item at `index` from the group selected by `select_group`."""
        group_key = f"input_{select_group}"
        group = kwargs.get(group_key)

        data = group["data"] if isinstance(group, dict) and "data" in group else group
        type = (
            group["type"]
            if isinstance(group, dict) and "type" in group
            else "plain_data"
        )
        count = len(data) if data is not None else 0

        logger.info(f"E: {data}, type: {type}, len: {count}")

        valid = type_strict and cls._check_type_consistency(**kwargs) or not type_strict
        if valid:
            if data is None:
                raise ValueError(
                    f"DynamicGroupSelector: GROUP input '{group_key}' is not connected."
                )
            if index < 0 or index >= count:
                raise IndexError(
                    f"DynamicGroupSelector: Index {index} is out of bound. The group {select_group} has {count} item(s)."
                )

        return io.NodeOutput(data[index])


class DynamicTypeSelector(io.ComfyNode):
    """
    Select one input from a set of dynamic inputs.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DynamicTypeSelector",
            display_name="Dynamic Type Selector",
            category=define.author,
            is_experimental=True,
            description="Select one input from a set of dynamic inputs.",
            inputs=[
                SchemaDefineHelper.selection_input(
                    id="select",
                    tooltip="Output the item based on the zero-based index selection.",
                ),
                SchemaDefineHelper.dynamic_input(),
                io.Boolean.Input(
                    id="use_bool_item",
                    display_name="use_bool_item",
                    tooltip="Use a true or false branch to select items.",
                ),
                io.Boolean.Input(
                    id="bool_item",
                    display_name="bool_item",
                    tooltip="Set to true to use the item_true as the output; false to use the item_false.",
                ),
                io.Int.Input(
                    id="item_true",
                    display_name="item_true",
                    default=0,
                    min=0,
                    max=define.max_inputs,
                    step=1,
                    display_mode=io.NumberDisplay.number,
                    tooltip="When set the bool_item to true, this item will be used as the output.",
                ),
                io.Int.Input(
                    id="item_false",
                    display_name="item_false",
                    default=0,
                    min=0,
                    max=define.max_inputs,
                    step=1,
                    display_mode=io.NumberDisplay.number,
                    tooltip="When set the bool_item to false, this item will be used as the output.",
                ),
            ],
            outputs=[SchemaDefineHelper.dynamic_output()],
            accept_all_inputs=True,
        )

    @classmethod
    def fingerprint_inputs(cls, select: int, **kwargs) -> int:
        return select

    @classmethod
    def validate_inputs(
        cls,
        select: int,
        use_bool_item: bool,
        bool_item: bool,
        item_true: int,
        item_false: int,
        **kwargs,
    ) -> bool | str:
        selected_index = (
            select if not use_bool_item else (item_true if bool_item else item_false)
        )
        input_key = f"input_{selected_index}"
        if input_key not in kwargs:
            return f"Selected input '{input_key}' must be connected."

        return True

    @classmethod
    def execute(
        cls,
        select: int,
        use_bool_item: bool,
        bool_item: bool,
        item_true: int,
        item_false: int,
        **kwargs,
    ) -> io.NodeOutput:
        index = (
            select if not use_bool_item else (item_true if bool_item else item_false)
        )
        input_keys = [k for k in kwargs.keys() if k.startswith("input_")]
        count = len(input_keys)

        if index < 0 or index >= count:
            raise IndexError(
                f"DynamicTypeSelector: Index {index} is out of bound. The node has {count} input(s)."
            )

        input_key = f"input_{index}"
        val = kwargs.get(input_key, None)
        if val is None:
            raise ValueError(
                f"DynamicTypeSelector: Selected input '{input_key}' is missing or not connected."
            )

        return io.NodeOutput(val)


class DynamicCombo(io.ComfyNode):
    """
    Create a dynamic combo box from a string list.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DynamicCombo",
            display_name="Dynamic Combo",
            category=define.author,
            is_experimental=True,
            description="Create a dynamic combo box from a string list.",
            inputs=[
                io.Combo.Input("choice", options=[]),
                io.String.Input("choice_list", multiline=True),
                io.Combo.Input(
                    "split_mode",
                    options=[
                        "newline",
                        "comma",
                        "semicolon",
                        "pipe",
                        "custom",
                        "regex",
                    ],
                    default="newline",
                    tooltip="Choose how to split the string into a combo.",
                ),
                io.String.Input(
                    "custom_delimiter",
                    default="|",
                    tooltip="Used when split_mode is 'custom' or 'regex'",
                ),
            ],
            outputs=[
                io.String.Output(display_name="STRING"),
                io.Int.Output(display_name="INDEX"),
                io.String.Output(display_name="FULL_LIST"),
            ],
            accept_all_inputs=True,
        )

    @staticmethod
    def _parse_list(choice_list: str, split_mode: str, custom_delimiter: str):
        if not choice_list:
            return []
        if split_mode == "newline":
            raw = choice_list.splitlines()
        elif split_mode == "comma":
            raw = choice_list.split(",")
        elif split_mode == "semicolon":
            raw = choice_list.split(";")
        elif split_mode == "pipe":
            raw = choice_list.split("|")
        elif split_mode == "custom":
            raw = choice_list.split(custom_delimiter)
        elif split_mode == "regex":
            try:
                raw = re.split(custom_delimiter, choice_list)
            except re.error:
                raw = [choice_list]  # fallback safely
        else:
            raw = [choice_list]

        return [x.strip() for x in raw if x.strip()]

    @classmethod
    def validate_inputs(
        cls,
        choice: str,
        choice_list: str = "",
        split_mode: str = "newline",
        custom_delimiter: str = "",
        **kwargs,
    ) -> bool:
        if not choice_list:
            return True

        items = cls._parse_list(choice_list, split_mode, custom_delimiter)

        if choice in items:
            return True

        return f"Value '{choice}' is not in the dynamically generated list."

    @classmethod
    def execute(
        cls,
        choice: io.Combo.Type,
        choice_list: str = "",
        split_mode: str = "newline",
        custom_delimiter: str = "|",
    ) -> io.NodeOutput:
        items = cls._parse_list(choice_list, split_mode, custom_delimiter)

        if not items:
            return io.NodeOutput("", 0, "")

        if choice not in items:
            choice = items[0]

        index = items.index(choice)

        normalized_list = "\n".join(items)

        return io.NodeOutput(choice, index, normalized_list)


class SchemaDefineHelper:
    @staticmethod
    def selection_input(
        max_inputs: int = define.max_inputs, id: str = "select", tooltip: str = ""
    ) -> io.Int.Input:
        return io.Int.Input(
            id=id,
            display_name=id,
            default=0,
            min=0,
            max=max_inputs,
            step=1,
            display_mode=io.NumberDisplay.number,
            tooltip=tooltip,
        )

    @staticmethod
    def dynamic_input(id: str = "input_0") -> io.AnyType.Input:
        return io.AnyType.Input(id=id, display_name=id)

    @staticmethod
    def dynamic_output(id: str = "output") -> io.AnyType.Output:
        return io.AnyType.Output(id=id, display_name=id.upper())


NODE_CLASS_MAPPINGS = {
    "DynamicGroup": DynamicGroup,
    "DynamicGroupSelector": DynamicGroupSelector,
    "DynamicTypeSelector": DynamicTypeSelector,
    "DynamicCombo": DynamicCombo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DynamicGroup": "Dynamic Group",
    "DynamicGroupSelector": "Dynamic Group Selector",
    "DynamicTypeSelector": "Dynamic Type Selector",
    "DynamicCombo": "Dynamic Combo",
}
