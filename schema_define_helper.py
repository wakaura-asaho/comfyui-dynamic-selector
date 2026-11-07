from comfy_api.latest import io
from .define import define

dynamic_input_prefix = define.di_prefix
dynamic_key_prefix = define.dk_prefix


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
    def dynamic_key_input(id: str = dynamic_key_prefix + "0") -> io.String.Input:
        return io.String.Input(id=id, display_name=id, default=id, optional=True)

    @staticmethod
    def key_output(id: str = "key") -> io.String.Output:
        return io.String.Output(id=id, display_name="KEY")

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

    @staticmethod
    def split_mode_input(tooltip: str = "Choose how to split the string.") -> io.Combo.Input:
        return io.Combo.Input(
            id="split_mode",
            options=[
                "newline",
                "comma",
                "semicolon",
                "pipe",
                "custom",
                "regex",
            ],
            default="newline",
            tooltip=tooltip,
        )

    @staticmethod
    def custom_delimiter_input(
        tooltip: str = "Used when split_mode is 'custom' or 'regex'",
    ) -> io.String.Input:
        return io.String.Input(
            id="custom_delimiter",
            default="|",
            tooltip=tooltip,
        )
