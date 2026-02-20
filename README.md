A collection of utility nodes designed to bring dynamic logic and flexible selection to your ComfyUI workflows.

<p align="center">
<img src="https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/logo.png" alt="Logo" style="display: block; margin: 0 auto; text-align: center;">
</p>

## Nodes Included

### 1. Dynamic Type Selector

An advanced "Switch" or "Router" node that can handle **any** data type (Images, Latents, Models, Strings, etc.). It allows you to choose which input to pass through to the output dynamically.

* **Dynamic Inputs:** Right-click the node to "Add Input" or "Remove Input" to create as many slots as you need (`input_0`, `input_1`, etc.).
* **Smart Type Matching:** The node automatically changes its output type based on what is connected to `input_0`. No longer requires multiple different nodes to pass different types of data.
* **Lazy Evaluation:** Only the selected branch is evaluated, saving processing time.
* **Boolean Toggle:** * If `use_bool_item` is off: Selects the input based on the `select` index.
* If `use_bool_item` is on: Uses a True/False logic to jump between two specific input indices defined in `item_true` and `item_false`.


### 2. Dynamic Combo

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

> [!NOTE]
> **Dynamic Type Selector:** `input_0` is the key input to determine the type of the rest of the inputs. If a different type of input is connected to `input_0`, connections with type mismatch will be disconnected.

Use `use_bool_item` to select an item as output conditionally.

When the toggle is on, the `select` index will not be used and the widget will be greyed out.

![Bool_Item](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/bool_item02.png)

You can find a simple workflow file in the `workflows` folder.

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
> **Dynamic Type Selector:** When using the "Add Input" feature, connect your main data type to `input_0` first. This "locks" the node to that data type, ensuring all subsequent inputs and the output match correctly.

## Compatible Versions and Notices

The nodes are intended for use with a newer version of ComfyUI and are written as V3 nodes.

* Tested Environment: Frontend = v1.37.11, base = 0.12.3
