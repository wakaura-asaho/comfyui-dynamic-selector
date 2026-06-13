import os
import folder_paths
from .dynamic_selector import DynamicGroup, DynamicGroupSelector, DynamicTypeSelector, DynamicCombo
from .dynamic_iterator import FloatIterator, IntIterator, StringIterator

NODE_CLASS_MAPPINGS = {
    "FloatIterator": FloatIterator,
    "IntIterator": IntIterator,
    "StringIterator": StringIterator,
    "DynamicGroup": DynamicGroup,
    "DynamicGroupSelector": DynamicGroupSelector,
    "DynamicTypeSelector": DynamicTypeSelector,
    "DynamicCombo": DynamicCombo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FloatIterator": "Float Iterator",
    "IntIterator": "Int Iterator",
    "StringIterator": "String Iterator",
    "DynamicGroup": "Dynamic Group",
    "DynamicGroupSelector": "Dynamic Group Selector",
    "DynamicTypeSelector": "Dynamic Type Selector",
    "DynamicCombo": "Dynamic Combo",
}

folder_paths.add_model_folder_path("Wakaura", os.path.join(folder_paths.models_dir, "Wakaura"))

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']