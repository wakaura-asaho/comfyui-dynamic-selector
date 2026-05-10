# ComfyUI Dynamic Selector

A collection of utility nodes designed to bring dynamic logic and flexible selection to your ComfyUI workflows.

<p align="center">
<img src="https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/logo.png" alt="Logo" style="display: block; margin: 0 auto; text-align: center;">
</p>

## Nodes Included

### 1. Dynamic Type Selector

An advanced "Switch" or "Router" node that can handle **any** data type (Images, Latents, Models, Strings, etc.). It allows you to choose which input to pass to the output at will.

* **Dynamic Inputs:** Right-click the node to "Add Input" or "Remove Input" to create as many slots as you need (`input_0`, `input_1`, etc.).
* **Batch Add/Remove:** The context menu also supports batch add/remove operations and enforces a maximum of 99 inputs.
* **Smart Type Matching:** The node keeps its output type in sync with connected inputs, resetting to wildcard when nothing is connected and locking to the first connected input type once a branch is attached.
* **Lazy Evaluation:** Only the selected branch is evaluated, saving processing time.
* **Boolean Toggle:** When `use_bool_item` is off, the node uses the `select` index. When `use_bool_item` is on, it switches between `item_true` and `item_false` indices instead.

### 2. Dynamic Group

Packs multiple inputs of the same type into a unified `GROUP` object, allowing you to manage collections of data as a single stream.

* **Group Packing:** Convert individual inputs (Images, Models, etc.) into a structured group.
* **Type Preservation:** Automatically detects and maintains the underlying data type of the grouped items.
* **Dynamic Scaling:** Add or remove input slots dynamically via the context menu.

### 3. Dynamic Group Selector

Provides advanced nested selection by extracting a specific item from a specific group. This allows for deeper logic control compared to the standard Dynamic Type Selector.

* **Double-Layer Selection:** Select which `GROUP` input to access, then target a specific `index` within that group.
* **Nested Logic:** Perfect for switching between different sets of data (e.g., alternating between different character asset packs).
* **Type Safety:** The `Type Strict` toggle ensures all connected groups share the same data type. If set, the node will raise an error and interrupt the execution.

### 4. Dynamic Combo

A string manipulation node that creates a searchable dropdown (Combo Box) directly from a text list.

* **Real-time Updates:** Type a list of items into the text area, and the dropdown menu updates instantly.
* **Multiple Split Modes:** Parse your list using:
* Newlines, Commas, Semicolons, or Pipes (`|`).
* **Custom Delimiters:** Define your own separator.
* **Regex:** Use Regular Expressions for complex list parsing.


* **Outputs:** Returns the selected string, its index in the list, and the cleaned-up full list.

---

## Example Usage

The image below demonstrates the combination of a custom combo and outputs its zero-based index to the selection widget.

![Switch_Image](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/switch_image.png)

To add or remove an input from the `DynamicTypeSelector`, use the right-click context menu.

![Inputs](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/inputs.png)

The first data connected to any of the inputs will determine the types of the rest of the nodes. When the last node is disconnected from the inputs, the type will be reset back to `any`.

You can also add/remove multiple inputs with the `Batch Add/Remove Inputs`.

![Bulk Add/Remove Inputs](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/bulk_input_control.png)

Use `use_bool_item` to select an item conditionally as an output.

When the toggle is on, the `select` index will not be used, and the widget will be greyed out.

![Bool_Item](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/bool_item02.png)

Use Dynamic Group to collect data of the same type and pack them into a group, creating a nested data flow execution.

You can then use the Group Selector to extract the data from the group and pass it through the OUTPUT socket.

![Group_Selection](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/grouped_selection.png)

If `Type Strict` is set to `True`, the node will check if the data type stored in each group is the same; if not the same, an error is raised.

![Group_Selection](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/grouped_selection_type_check.png)

All example workflows are located at the `workflows` folder.

---

## Installation

### Method 1: ComfyUI Manager (Recommended)

1. Install [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager).
2. Click on **"Install via Git URL"**.
3. Paste the URL of this repository.
4. Restart ComfyUI.

### Method 2: Manual Installation

1. Open a terminal in your `ComfyUI/custom_nodes` folder.
2. Clone this repository:
```bash
git clone https://github.com/wakaura-asaho/comfyui-dynamic-selector.git

```


3. Restart ComfyUI.

---

## File Structure

To keep the logic and UI clean, this extension uses:

* `dynamic_selector.py`: Backend logic and node definitions.
* `dynamic_selector.js`: Custom browser-side logic for dynamic input handling and UI visibility.

## Usage Tips

> [!TIP]
> **Dynamic Type Selector:** When using the "Add Input" feature, connect your main data type to any inputs. This "locks" the node to that data type, ensuring all subsequent inputs and the output match correctly.

> [!TIP]
> **Dynamic Group Selector:** Use the `Type Strict` toggle when your workflow demands consistent data types across all groups, or disable it for more flexible, heterogeneous data handling.

## Compatible Versions and Notices

The nodes are intended for use with a newer version of ComfyUI and are written as V3 nodes.

* Tested Environment: Frontend = v1.37.11, base = 0.12.3
