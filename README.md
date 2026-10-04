# ComfyUI Dynamic Selector

A collection of utility nodes designed to bring dynamic logic and flexible selection to your ComfyUI workflows.

<p align="center">
<img src="https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/logo.png" alt="Logo" style="display: block; margin: 0 auto; text-align: center;">
</p>

## Nodes Included

### 1. Dynamic Type Selector

An advanced "Switch" or "Router" node that can handle **any** data type (Images, Latents, Models, Strings, etc.). It allows you to choose which input to pass to the output at will.

* **Dynamic Inputs:** Right-click the node to "Add Input" or "Remove Input" to create as many slots as you need (`input_0`, `input_1`, etc.). Slots are optional (hollow sockets) until you connect them.
* **Batch Add/Remove:** The context menu also supports batch add/remove operations and enforces a maximum of 99 inputs.
* **Smart Type Matching:** The node keeps its output type in sync with connected inputs, resetting to wildcard when nothing is connected and locking to the first connected input type once a branch is attached.
* **Lazy Evaluation:** Only the selected branch is evaluated, saving processing time.
* **Boolean Toggle:** When `use_bool_item` is on, it switches between `item_true` and `item_false` indices instead of the `select` index (`select` is ignored while the toggle is on).
* **Random selection:** Enable `random_selection` to pick a connected `input_N` at run time. Connect an optional **Weighted Randomizer** to bias which index is chosen (see below). With no randomizer connected, every non-empty candidate index has equal chance. When random mode is on, manual selection widgets (`select`, boolean index widgets) are disabled in the UI.
* **Index output:** `index` (INT) emits the zero-based `input_N` index used for the current run (manual `select` or random pick).

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
* **Random selection:** With `random_selection` enabled, the node picks a **group** (`input_N`) at run time (optionally weighted via **Weighted Randomizer**), then picks an **item index inside that group uniformly** (not weighted). When random mode is on, `select_group` and `index` widgets are disabled in the UI.
* **Index outputs:** `group_index` (INT) is the chosen group’s `input_N` index; `index` (INT) is the item index inside that group.

### 4. Dynamic Combo

A string manipulation node that creates a searchable dropdown (Combo Box) directly from a text list.

* **Real-time Updates:** Type a list of items into the text area, and the dropdown menu updates instantly.
* **Multiple Split Modes:** Parse your list using newlines, commas, semicolons, pipes (`|`), a **custom delimiter**, or **regex**.
* **Outputs:** Returns the selected string, its zero-based index in the list, and the cleaned-up full list.
* **Random selection:** Enable `random_selection` to pick a line/item from the parsed list each run. An optional **Weighted Randomizer** biases by **list index** (`0` = first item after splitting). When random mode is on, the `choice` combo widget is disabled in the UI.

> [!NOTE]
> **Dynamic Combo and Weighted Randomizer — current limitations**
> * Weight slots on **Weighted Randomizer** do **not** auto-sync to how many lines your `choice_list` produces. Only **Dynamic Type Selector** and **Dynamic Group Selector** support the “sync weight count with linked selector” setting.
> * For weighted combo random, add enough weight widgets on the randomizer yourself so indices `0 … N-1` match your parsed options. Extra weight widgets beyond the list length are ignored; missing indices behave as weight `1` when that index is still eligible.
> * Changing `choice_list` or `split_mode` changes option count without updating the randomizer — recheck weights after edits.

### 5. Weighted Randomizer

Supplies integer weights to selector nodes for biased random picks.

* **Dynamic weight widgets:** `input_0`, `input_1`, … (same naming as selector inputs), added/removed from the node context menu or batch dialog.
* **Output:** Connect `weighted_randomizer` (`W_RANDOMIZER`) to **Dynamic Type Selector**, **Dynamic Group Selector**, or **Dynamic Combo**.
* **Sync with selectors:** In ComfyUI **Settings → Wakaura → Weighted Randomizer**, enable **Sync weight count with linked selector** so the randomizer’s widget count tracks the maximum `input_N` count across linked type/group selectors (manual add/remove menus are hidden while sync is on).

### 6. Float Iterator

Generates a list of float values from `Start` to `Stop` using a specified `Increment`. ComfyUI fans out the returned list, executing connected downstream nodes once per value.

* **Direction Validation:** Prevents infinite loops by ensuring the increment direction aligns with the start and stop bounds.
* **Precision Guard:** Uses decimal rounding to suppress floating-point drift.

### 7. Int Iterator

Generates a list of integers from `Start` to `Stop` using a specified `Increment`. ComfyUI fans out the list to execute downstream nodes once per value.

### 8. String Iterator

Iterates through a list of strings provided one per line. ComfyUI fans out the list to execute downstream nodes once per string value.

**Iterator loop cooldown (global):** Configure a single cooldown in **Settings → Wakaura → Iterator**:

* **Iterator loop cooldown (seconds)** — Pause between list steps on **heavy** downstream nodes only (`0` = disabled). Fast prep steps (for example `CLIPTextEncode`) are not paced.
* **Extra cooldown nodes** — **Search & add nodes…** opens a searchable picker (same node catalog as the graph) to add custom `class_type` values to the allowlist without typos.

Built-in cooldown node types include core samplers (`KSampler`, `KSamplerAdvanced`, `SamplerCustom`, `SamplerCustomAdvanced`), common VAE encode/decode nodes, `ImageUpscaleWithModel`, `LatentUpscale` / `LatentUpscaleBy`, and `SeedVR2VideoUpscaler`. Extras are stored in `ds_settings.json` as `iterator_execution_break_extra_node_types` (comma-separated `class_type` strings). Values sync from the ComfyUI settings UI via `/api/wakaura/dynamic-selector/settings`.

---

## Extension settings

In ComfyUI **Settings → Wakaura**:

| Section | Setting | Purpose |
|--------|---------|--------|
| **Dynamic Selector** | Dynamic socket growth | Grow or compact `input_N` sockets as you connect or disconnect (when disabled, use the context menu only). |
| **Dynamic Selector** | Auto-collapse empty inputs | When socket growth is on, trim trailing empty slots and keep indices compact. |
| **Iterator** | Iterator loop cooldown (seconds) | Global pause between iterator list steps on allowlisted heavy nodes (`iterator_execution_break_seconds` in `ds_settings.json`). |
| **Iterator** | Extra cooldown nodes | Manage extra allowlisted node types via **Search & add nodes…** (`iterator_execution_break_extra_node_types`). |
| **Weighted Randomizer** | Sync weight count with linked selector | Match weight widget count to linked type/group selector inputs (see limitations for **Dynamic Combo** above). |

Defaults are stored in `ds_settings.json` at the pack root and can be updated from the UI. The built-in execution-break allowlist is also exposed at `GET /api/wakaura/dynamic-selector/execution-break-defaults`.

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

### Randomized selection

Enable `random_selection` on a selector or **Dynamic Combo**, optionally connect **Weighted Randomizer**, and wire the chosen branch or string into the rest of the graph. Each queue run can pick a different input or list item.

![Randomized selection](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/randomized_selection.png)

Example workflow: [`workflows/example_workflow_randomizer.json`](workflows/example_workflow_randomizer.json)

### Iterators

* **Float Iterator with KSampler:** Connect `Float Iterator` to the KSampler `CFG` input to test the model's behavior across different CFG values in sequence.

    ![Float Iterator with KSampler](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/iterator_float.png)

* **Float Iterator with Model Patcher:** Connect `Float Iterator` to model patchers like `FreeU_V2` to evaluate parameter sweeps.

    ![Float Iterator with FreeU_V2](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/iterator_float2.png)

* **String Iterator with Prompts:** Connect `String Iterator` to prompt fields to compare the effects of different prompts on the generated results.

    ![String Iterator with Prompts](https://github.com/wakaura-asaho/comfyui-dynamic-selector/blob/main/docs/iterator_string.png)

* **Cooldown between heavy steps:** With **Iterator loop cooldown** set above `0`, a multi-item iterator run pauses between each list index only on allowlisted nodes (for example between successive `KSampler` calls), which can help thermals/VRAM on long batch graphs without slowing lightweight nodes in between.

> [!NOTE]
> The iterator example workflows use a new native node called `Text Format`, which is only available in newer versions of ComfyUI (tested: ComfyUI 0.24.1). If you encounter errors when opening these workflows, please update ComfyUI or use alternative nodes to wire the desired connections.

Example workflows in the `workflows` folder:

| File | Description |
|------|-------------|
| `example_workflow.json` | Dynamic Type Selector basics |
| `example_workflow_gs.json` | Dynamic Group and Group Selector |
| `example_workflow_iterator.json` | Float / string iterators |
| `example_workflow_randomizer.json` | `random_selection` with Weighted Randomizer |

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

* `dynamic_selector.py`: Backend logic and node definitions for selectors, groups, combo, and weighted randomizer.
* `dynamic_iterator.py`: Backend logic and node definitions for iterators.
* `iterator_execution.py`: Runtime hook that applies iterator loop cooldown during list execution on allowlisted node types.
* `execution_break_config.py`: Built-in cooldown allowlist and reading of `ds_settings.json` cooldown keys.
* `dynamic_selector.js`: Browser-side logic for dynamic inputs, combo list refresh, group sockets, random-selection widget state, and weighted randomizer UI.
* `ds_settings.js` / `ds_settings.json`: ComfyUI settings panel and persisted defaults (socket growth, iterator cooldown, randomizer sync).
* `ds_execution_break_nodes.js`: Searchable **Extra cooldown nodes** picker UI for the Iterator settings section.

## Usage Tips

> [!TIP]
> **Dynamic Type Selector:** When using the "Add Input" feature, connect your main data type to any inputs. This "locks" the node to that data type, ensuring all subsequent inputs and the output match correctly.

> [!TIP]
> **Dynamic Group Selector:** Use the `Type Strict` toggle when your workflow demands consistent data types across all groups, or disable it for more flexible, heterogeneous data handling.

> [!TIP]
> **Random selection:** Turn on `random_selection` when you want variety per run without changing the workflow. Use **Weighted Randomizer** when some branches or combo lines should be picked more often than others.

> [!TIP]
> **Iterator cooldown:** Use a modest cooldown (for example 2–10 seconds) when batching many KSampler or upscale steps from an iterator. Add custom heavy nodes through **Search & add nodes…** if your graph uses non-core node types that should pause between iterations.

## Compatible Versions and Notices

The nodes are implemented as ComfyUI V3 extension nodes (`ComfyExtension` entrypoint).

* Tested environment: Frontend = v1.37.11, ComfyUI base ≥ 0.12.3 (`requires-comfyui` in `pyproject.toml`).
* Pack version: 1.3.00 (weighted randomizer, `random_selection`, extension settings API).
* Pack version: 1.4.00 (Iterator loop cooldown, selector `index` / `group_index` outputs).