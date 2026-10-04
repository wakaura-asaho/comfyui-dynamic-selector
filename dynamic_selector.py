from comfy_api.latest import io
import re
import logging
from .define import define
import random

logger = logging.getLogger(define.logger_name)

dynamic_input_prefix = define.di_prefix

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
                key = f"{dynamic_input_prefix}{idx}"
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
                SchemaDefineHelper.weighted_randomizer_input(),
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
                    default=False,
                    tooltip="If different types of data get passed into the node, raise an error.",
                ),
                SchemaDefineHelper.random_selection_input(
                    tooltip="Randomly select a group and an item from that group."
                ),
                io.Custom("GROUP").Input(
                    id=f"{dynamic_input_prefix}0",
                    display_name=f"{dynamic_input_prefix}0",
                    optional=True,
                ),
            ],
            outputs=[
                SchemaDefineHelper.dynamic_output(),
                SchemaDefineHelper.group_index_output(),
                SchemaDefineHelper.index_output(),
            ],
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
        input_keys = sorted([k for k in kwargs.keys() if k.startswith(dynamic_input_prefix)])

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

    @staticmethod
    def _input_indices(kwargs: dict, require_value: bool = False) -> list[int]:
        indices: list[int] = []
        for key, val in kwargs.items():
            if not key.startswith(dynamic_input_prefix):
                continue
            suffix = key[len(dynamic_input_prefix):]
            if not suffix.isdigit():
                continue
            if require_value and val is None:
                continue
            indices.append(int(suffix))
        indices.sort()
        return indices

    @classmethod
    def _group_item_count(cls, group) -> int:
        if group is None:
            return 0
        data = group["data"] if isinstance(group, dict) and "data" in group else group
        return len(data) if data is not None else 0

    @classmethod
    def fingerprint_inputs(
        cls,
        select_group: int,
        index: int,
        type_strict: bool,
        random_selection: bool = False,
        **kwargs,
    ) -> object:
        if random_selection is not False:
            return float("nan")
        return (select_group, index)

    @classmethod
    def validate_inputs(
        cls,
        select_group: int,
        random_selection: bool | None = False,
        **kwargs,
    ) -> bool | str:
        if random_selection:
            group_indices = cls._input_indices(kwargs)
            if not group_indices:
                return "At least one group input must be connected."
            return True
        if random_selection is None:
            return True

        group_key = f"{dynamic_input_prefix}{select_group}"
        if group_key not in kwargs:
            return (
                f"Input '{group_key}' must be connected for selection {select_group}."
            )

        return True

    @classmethod
    def execute(
        cls,
        select_group: int,
        index: int,
        type_strict: bool,
        random_selection: bool,
        weighted_randomizer: object | None = None,
        **kwargs,
    ) -> io.NodeOutput:
        """Return the item at `index` from the group selected by `select_group`."""
        if random_selection:
            group_indices = cls._input_indices(kwargs, require_value=True)
            if not group_indices:
                raise ValueError(
                    "DynamicGroupSelector: No valid group inputs to select from."
                )
            nonempty = [
                gi
                for gi in group_indices
                if cls._group_item_count(kwargs.get(f"{dynamic_input_prefix}{gi}")) > 0
            ]
            if not nonempty:
                raise ValueError(
                    "DynamicGroupSelector: No connected group contains items."
                )
            select_group = Randomizer.pick_random_index(
                nonempty, weighted_randomizer, kwargs
            )
            index = random.randrange(
                cls._group_item_count(kwargs.get(f"{dynamic_input_prefix}{select_group}"))
            )

        group_key = f"{dynamic_input_prefix}{select_group}"
        group = kwargs.get(group_key)

        data = group["data"] if isinstance(group, dict) and "data" in group else group
        type = (
            group["type"]
            if isinstance(group, dict) and "type" in group
            else "plain_data"
        )
        count = len(data) if data is not None else 0

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

        return io.NodeOutput(data[index], select_group, index)


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
                SchemaDefineHelper.weighted_randomizer_input(),
                SchemaDefineHelper.selection_input(
                    id="select",
                    tooltip="Output the item based on the zero-based index selection.",
                ),
                SchemaDefineHelper.dynamic_input(),
                io.Boolean.Input(
                    id="use_bool_item",
                    display_name="use_bool_item",
                    default=False,
                    tooltip="Use a true or false branch to select items.",
                ),
                io.Boolean.Input(
                    id="bool_item",
                    display_name="bool_item",
                    default=False,
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
                SchemaDefineHelper.random_selection_input(
                    tooltip="Randomly select an item from the inputs."
                ),
            ],
            outputs=[
                SchemaDefineHelper.dynamic_output(),
                SchemaDefineHelper.index_output(),
            ],
            accept_all_inputs=True,
        )

    @staticmethod
    def _input_indices(kwargs: dict, require_value: bool = False) -> list[int]:
        indices: list[int] = []
        for key, val in kwargs.items():
            if not key.startswith(dynamic_input_prefix):
                continue
            suffix = key[len(dynamic_input_prefix):]
            if not suffix.isdigit():
                continue
            if require_value and val is None:
                continue
            indices.append(int(suffix))
        indices.sort()
        return indices

    @classmethod
    def fingerprint_inputs(
        cls, select: int = 0, random_selection: bool = False, **kwargs
    ) -> object:
        if random_selection is not False:
            return float("nan")
        return select

    @classmethod
    def validate_inputs(
        cls,
        select: int | None = None,
        use_bool_item: bool = False,
        bool_item: bool | None = False,
        item_true: int | None = 0,
        item_false: int | None = 0,
        random_selection: bool | None = False,
        **kwargs,
    ) -> bool | str:
        if random_selection:
            if not cls._input_indices(kwargs):
                return "At least one input must be connected."
            return True
        if random_selection is None:
            return True

        if use_bool_item:
            if bool_item is None:
                return True
            selected_index = item_true if bool_item else item_false
        else:
            selected_index = select

        if selected_index is None:
            return True

        try:
            selected_index = int(selected_index)
        except (TypeError, ValueError):
            return f"Invalid select index: {selected_index}."

        input_key = f"{dynamic_input_prefix}{selected_index}"
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
        random_selection: bool,
        weighted_randomizer: object | None = None,
        **kwargs,
    ) -> io.NodeOutput:
        indices = cls._input_indices(kwargs, require_value=True)
        if not indices:
            raise ValueError(
                "DynamicTypeSelector: No valid inputs to select from."
            )

        if use_bool_item:
            index = item_true if bool_item else item_false
        elif random_selection:
            index = Randomizer.pick_random_index(
                indices, weighted_randomizer, kwargs
            )
        else:
            index = select

        try:
            index = int(index)
        except (TypeError, ValueError) as e:
            raise ValueError(
                f"DynamicTypeSelector: Invalid index {index}."
            ) from e

        if index not in indices:
            raise IndexError(
                f"DynamicTypeSelector: Index {index} is out of bound. Connected inputs: {indices}."
            )

        input_key = f"{dynamic_input_prefix}{index}"
        val = kwargs.get(input_key)
        if val is None:
            raise ValueError(
                f"DynamicTypeSelector: Selected input '{input_key}' is missing or not connected."
            )
        return io.NodeOutput(val, index)


class WeightedRandomizer(io.ComfyNode):
    """
    Provides per-input weights for Dynamic Type Selector random selection.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="WeightedRandomizer",
            display_name="Weighted Randomizer",
            category=define.author,
            is_experimental=True,
            description="Provides per-input weights for Dynamic Type Selector random selection.",
            inputs=[SchemaDefineHelper.weight_input()],
            outputs=[
                io.Custom("W_RANDOMIZER").Output(id="weighted_randomizer", display_name="W_RANDOMIZER"),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def execute(cls, **kwargs) -> io.NodeOutput:
        entries: list[tuple[int, int]] = []
        for key, val in kwargs.items():
            if not key.startswith(dynamic_input_prefix):
                continue
            suffix = key[len(dynamic_input_prefix):]
            if not suffix.isdigit():
                continue
            try:
                v = int(val)
            except (TypeError, ValueError):
                continue
            entries.append((int(suffix), v))
        entries.sort(key=lambda e: e[0])
        return io.NodeOutput([v for _, v in entries])

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
                SchemaDefineHelper.weighted_randomizer_input(),
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
                SchemaDefineHelper.random_selection_input(
                    tooltip="Randomly select an option from the list."
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
    def fingerprint_inputs(
        cls,
        choice: str = "",
        random_selection: bool = False,
        **kwargs,
    ) -> object:
        if random_selection is not False:
            return float("nan")
        return choice

    @classmethod
    def validate_inputs(
        cls,
        choice: str,
        choice_list: str = "",
        split_mode: str = "newline",
        custom_delimiter: str = "",
        random_selection: bool | None = False,
        **kwargs,
    ) -> bool:
        if random_selection:
            items = cls._parse_list(choice_list, split_mode, custom_delimiter)
            if not items:
                return "choice_list must produce at least one option for random selection."
            return True
        if random_selection is None:
            return True
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
        random_selection: bool = False,
        weighted_randomizer: object | None = None,
        **kwargs,
    ) -> io.NodeOutput:
        items = cls._parse_list(choice_list, split_mode, custom_delimiter)

        if not items:
            return io.NodeOutput("", 0, "")

        if random_selection:
            indices = list(range(len(items)))
            index = Randomizer.pick_random_index(
                indices, weighted_randomizer, kwargs
            )
            choice = items[index]
        else:
            if choice not in items:
                choice = items[0]
            index = items.index(choice)

        normalized_list = "\n".join(items)

        return io.NodeOutput(choice, index, normalized_list)

class Randomizer:
    @staticmethod
    def resolve_weighted_randomizer(
        weighted_randomizer: object | None, kwargs: dict
    ) -> object | None:
        if weighted_randomizer is not None:
            return weighted_randomizer
        return kwargs.get("weighted_randomizer")

    @staticmethod
    def weights_from_randomizer(weighted_randomizer: object) -> list[int] | None:
        if weighted_randomizer is None:
            return None
        data = weighted_randomizer
        if isinstance(data, tuple) and len(data) == 1:
            data = data[0]
        if not isinstance(data, list):
            return None
        weights: list[int] = []
        for item in data:
            try:
                weights.append(max(0, int(item)))
            except (TypeError, ValueError):
                weights.append(0)
        return weights

    @staticmethod
    def pick_random_index(
        indices: list[int],
        weighted_randomizer: object | None,
        kwargs: dict,
    ) -> int:
        wr = Randomizer.resolve_weighted_randomizer(weighted_randomizer, kwargs)
        weights_list = Randomizer.weights_from_randomizer(wr)
        if weights_list is None:
            return random.choice(indices)
        pool: list[int] = []
        wts: list[int] = []
        for i in indices:
            w = weights_list[i] if i < len(weights_list) else 1
            if w <= 0:
                continue
            pool.append(i)
            wts.append(w)
        if not pool:
            return random.choice(indices)
        return random.choices(pool, weights=wts, k=1)[0]

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
    def dynamic_input(id: str = dynamic_input_prefix + "0") -> io.AnyType.Input:
        return io.AnyType.Input(id=id, display_name=id, optional=True)

    @staticmethod
    def random_selection_input(id="random_selection", tooltip: str = "") -> io.Boolean.Input:
        return io.Boolean.Input(
            id=id,
            display_name="random_selection",
            default=False,
            tooltip=tooltip,
        )

    @staticmethod
    def weight_input(
        id: str = dynamic_input_prefix + "0",
        default: int = 1,
    ) -> io.Int.Input:
        return io.Int.Input(
            id=id,
            display_name=id,
            default=default,
            min=0,
            max=define.max_inputs,
            step=1,
            display_mode=io.NumberDisplay.number,
            optional=True,
        )

    @staticmethod
    def weighted_randomizer_input(id: str = "weighted_randomizer") -> io.Input:
        return io.Custom("W_RANDOMIZER").Input(
            id=id,
            display_name=id,
            tooltip="Provide per-input weights for random selection.",
            optional=True,
        )

    @staticmethod
    def dynamic_output(id: str = "output") -> io.AnyType.Output:
        return io.AnyType.Output(id=id, display_name=id.upper())

    @staticmethod
    def index_output(id: str = "index") -> io.Int.Output:
        return io.Int.Output(id=id, display_name="INDEX")

    @staticmethod
    def group_index_output(id: str = "group_index") -> io.Int.Output:
        return io.Int.Output(
            id=id,
            display_name="GROUP_INDEX",
            tooltip="Zero-based index of the selected GROUP input (input_N).",
        )

    @staticmethod
    def iterator_float_input(
        id: str,
        display_name: str,
        default: float,
    ) -> io.Float.Input:
        return io.Float.Input(
            id=id,
            display_name=display_name,
            default=default,
            min=define.min_itr,
            max=define.max_itr,
        )

    @staticmethod
    def iterator_int_input(
        id: str,
        display_name: str,
        default: int,
    ) -> io.Int.Input:
        return io.Int.Input(
            id=id,
            display_name=display_name,
            default=default,
            min=define.min_itr,
            max=define.max_itr,
        )
