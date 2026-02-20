import os
import folder_paths
from .dynamic_selector import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

folder_paths.add_model_folder_path("Wakaura", os.path.join(folder_paths.models_dir, "Wakaura"))

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']