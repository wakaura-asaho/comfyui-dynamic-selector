from comfy_api.latest import io
from .define import define
from .dynamic_selector import SchemaDefineHelper


class FloatIterator(io.ComfyNode):
    """
    Iterate through a collection of primitive value types: float.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="FloatIterator",
            display_name="Float Iterator",
            description="Iterate through a collection of primitive value types: float.",
            category=define.author,
            inputs=[
                SchemaDefineHelper.iterator_float_input("initialization", "Start", 0.0),
                SchemaDefineHelper.iterator_float_input("condition", "Stop", 10.0),
                SchemaDefineHelper.iterator_float_input("update", "Increment", 0.5),
            ],
            outputs=[
                io.Float.Output(
                    id="float",
                    display_name="FLOAT",
                    is_output_list=True,
                ),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def check_valid_condition(
        cls, initialization: float, condition: float, update: float
    ) -> bool | str:
        if update == 0:
            return "Increment cannot be zero."
        if update > 0 and initialization >= condition:
            return "With a positive increment, Start must be less than Stop."
        if update < 0 and initialization <= condition:
            return "With a negative increment, Start must be greater than Stop."
        return True

    @classmethod
    def validate_inputs(
        cls,
        initialization: float,
        condition: float,
        update: float,
        **kwargs,
    ) -> bool | str:
        return cls.check_valid_condition(initialization, condition, update)

    @classmethod
    def execute(
        cls,
        initialization: float,
        condition: float,
        update: float,
        **kwargs,
    ) -> io.NodeOutput:
        values = []
        current = initialization
        if update > 0:
            while current < condition:
                values.append(current)
                current = round(current + update, 10)
        else:
            while current > condition:
                values.append(current)
                current = round(current + update, 10)
        return io.NodeOutput(values)


class IntIterator(io.ComfyNode):
    """
    Iterate through a range of integers.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="IntIterator",
            display_name="Int Iterator",
            description="Iterate through a range of integers.",
            category=define.author,
            inputs=[
                SchemaDefineHelper.iterator_int_input("initialization", "Start", 0),
                SchemaDefineHelper.iterator_int_input("condition", "Stop", 10),
                SchemaDefineHelper.iterator_int_input("update", "Increment", 1),
            ],
            outputs=[
                io.Int.Output(
                    id="int",
                    display_name="INT",
                    is_output_list=True,
                ),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def check_valid_condition(
        cls, initialization: int, condition: int, update: int
    ) -> bool | str:
        if update == 0:
            return "Increment cannot be zero."
        if update > 0 and initialization >= condition:
            return "With a positive increment, Start must be less than Stop."
        if update < 0 and initialization <= condition:
            return "With a negative increment, Start must be greater than Stop."
        return True

    @classmethod
    def validate_inputs(
        cls,
        initialization: int,
        condition: int,
        update: int,
        **kwargs,
    ) -> bool | str:
        return cls.check_valid_condition(initialization, condition, update)

    @classmethod
    def execute(
        cls,
        initialization: int,
        condition: int,
        update: int,
        **kwargs,
    ) -> io.NodeOutput:
        return io.NodeOutput(list(range(initialization, condition, update)))


class StringIterator(io.ComfyNode):
    """
    Iterate through a list of strings, one per line.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="StringIterator",
            display_name="String Iterator",
            description="Iterate through a list of strings, one per line.",
            category=define.author,
            inputs=[
                io.String.Input(
                    id="items",
                    display_name="Items",
                    multiline=True,
                    default="",
                    tooltip="One string item per line.",
                ),
            ],
            outputs=[
                io.String.Output(
                    id="string",
                    display_name="STRING",
                    is_output_list=True,
                ),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, items: str, **kwargs) -> bool | str:
        if not items or not items.strip():
            return "Items must not be empty."
        return True

    @classmethod
    def execute(cls, items: str, **kwargs) -> io.NodeOutput:
        values = [line for line in items.splitlines() if line.strip()]
        return io.NodeOutput(values)
