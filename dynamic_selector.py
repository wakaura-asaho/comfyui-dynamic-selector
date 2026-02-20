from comfy_api.latest import io
import re

class DynamicTypeSelector(io.ComfyNode):
    """
    A custom node that allows any kind of inputs and only selects one as the output.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DynamicTypeSelector",
            display_name="Dynamic Type Selector",
            category="Wakaura",
            is_experimental=True,
            inputs=[
                io.Int.Input(
                    id="select",
                    default=0,
                    min=0,
                    max=99,
                    step=1,
                    display_mode=io.NumberDisplay.number,
                    tooltip="Output the item based on the zero-based index selection."
                ),
                io.AnyType.Input(
                    id="input_0",
                    display_name="input_0",
                ),
                io.Boolean.Input(
                    id="use_bool_item",
                    display_name="use_bool_item",
                    tooltip="Use a true or false branch to select items."
                ),
                io.Boolean.Input(
                    id="bool_item",
                    display_name="bool_item",
                    tooltip="Set to true to use the item_true as the output; false to use the item_false."
                ),
                io.Int.Input(
                    id="item_true",
                    display_name="item_true",
                    default=0,
                    min=0,
                    max=99,
                    step=1,
                    display_mode=io.NumberDisplay.number,
                    tooltip="When set the bool_item to true, this item will be used as the output."
                ),
                io.Int.Input(
                    id="item_false",
                    display_name="item_false",
                    default=0,
                    min=0,
                    max=99,
                    step=1,
                    display_mode=io.NumberDisplay.number,
                    tooltip="When set the bool_item to false, this item will be used as the output."
                ),
            ],
            outputs=[
                io.AnyType.Output(
                    id="output",
                    display_name="OUTPUT"
                ),
            ],
            accept_all_inputs=True, 
        )

    @classmethod
    def fingerprint_inputs(cls, select: int, **kwargs) -> int:
        return select

    @classmethod
    def check_lazy_status(cls, select: int, **kwargs) -> list[str]:
        """Only evaluate the selected input branch."""
        input_key = f"input_{select}"
        return [input_key]

    @classmethod
    def validate_inputs(cls, **kwargs) -> bool:
        select = kwargs.get("select")

        if select is None:
            return True 

        input_key = f"input_{select}"
        if input_key not in kwargs:
            return f"Error: Input '{input_key}' must be connected for selection {select}."
        return True

    @classmethod
    def execute(cls, select: int, use_bool_item: bool, bool_item: bool, item_true: int, item_false: int, **kwargs) -> io.NodeOutput:
        if not use_bool_item:
            selected_index = select
        else:
            selected_index = item_true if bool_item else item_false

        input_key = f"input_{selected_index}"

        val = kwargs.get(input_key, None)
        if val is None:
            raise ValueError(f"Selected input '{input_key}' is missing or not connected.")

        return (val,)

class DynamicCombo(io.ComfyNode):
    """
    An advanced node that creates a dynamic combo box from a string list.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DynamicCombo",
            display_name="Dynamic Combo",
            category="Wakaura",
            is_experimental=True,
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
                    tooltip="Choose how to split the string into a combo."
                ),
                io.String.Input(
                    "custom_delimiter",
                    default="|",
                    tooltip="Used when split_mode is 'custom' or 'regex'"
                )
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
    def validate_inputs(cls, choice: str, choice_list: str = "", split_mode: str = "newline", custom_delimiter: str = "", **kwargs) -> bool:
        if not choice_list:
            return True

        items = cls._parse_list(choice_list, split_mode, custom_delimiter)

        if choice in items:
            return True

        return f"Value '{choice}' is not in the dynamically generated list."

    @classmethod
    def execute(cls, choice: io.Combo.Type, choice_list: str = "", split_mode: str = "newline", custom_delimiter: str = "|") -> io.NodeOutput:
        items = cls._parse_list(choice_list, split_mode, custom_delimiter)

        if not items:
            return io.NodeOutput("", 0, "")

        if choice not in items:
            choice = items[0]

        index = items.index(choice)

        normalized_list = "\n".join(items)

        return io.NodeOutput(choice, index, normalized_list)

NODE_CLASS_MAPPINGS = {
    "DynamicTypeSelector": DynamicTypeSelector,
    "DynamicCombo": DynamicCombo
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DynamicTypeSelector": "Dynamic Type Selector",
    "DynamicCombo": "Dynamic Combo"
}