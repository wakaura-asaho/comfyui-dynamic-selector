import { app } from "/scripts/app.js";
import {
    bindRandomSelectionCallback,
    isRandomSelectionActive,
    refreshNodeAfterWidgetStateChange,
    registerSettingsSync,
    syncCustomDelimiterVisibility,
    syncPromotedChoiceComboHostOptions,
    updateWidgetAvailability,
} from "./ds_common.js";

app.registerExtension({
    name: "Wakaura.DynamicCombo",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DynamicCombo")
            return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;

            const choiceWidget = this.widgets.find(w => w.name === "choice");
            const listWidget = this.widgets.find(w => w.name === "choice_list");
            const splitModeWidget = this.widgets.find(w => w.name === "split_mode");
            const customDelimiterWidget = this.widgets.find(w => w.name === "custom_delimiter");
            const randomSelectionWidget = this.widgets.find(w => w.name === "random_selection");
            const anyMissing = !choiceWidget || !listWidget || !splitModeWidget || !customDelimiterWidget;

            if (anyMissing)
                return;

            let previousItems = [];

            function splitItems(text) {
                if (!text) return [];

                const mode = splitModeWidget?.value ?? "newline";
                const delimiter = customDelimiterWidget?.value ?? "|";

                let raw;

                switch (mode) {
                    case "newline":
                        raw = text.split(/\r?\n/);
                        break;
                    case "comma":
                        raw = text.split(",");
                        break;
                    case "semicolon":
                        raw = text.split(";");
                        break;
                    case "pipe":
                        raw = text.split("|");
                        break;
                    case "custom":
                        raw = text.split(delimiter);
                        break;
                    case "regex":
                        try {
                            raw = text.split(new RegExp(delimiter));
                        } catch {
                            raw = [text];
                        }
                        break;
                    default:
                        raw = [text];
                }

                return raw.map(v => v.trim()).filter(v => v.length > 0);
            }

            function arraysEqual(a, b) {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (a[i] !== b[i]) return false;
                }
                return true;
            }

            const updateCombo = () => {
                const items = splitItems(listWidget.value);

                if (arraysEqual(items, previousItems)) {
                    return;
                }

                previousItems = [...items];

                choiceWidget.options.values = items;

                if (!items.includes(choiceWidget.value)) {
                    choiceWidget.value = items[0] ?? "";
                }

                choiceWidget.callback?.(choiceWidget.value);
                syncPromotedChoiceComboHostOptions(choiceWidget);
                app.graph.setDirtyCanvas(true);
            };

            function updateComboChoiceAvailability(skipCanvasRefresh = false) {
                updateWidgetAvailability(
                    node,
                    choiceWidget,
                    true,
                    !isRandomSelectionActive(node),
                    true,
                );
                if (!skipCanvasRefresh)
                    refreshNodeAfterWidgetStateChange(node);
            }

            // Initial setup
            requestAnimationFrame(() => {
                syncCustomDelimiterVisibility(node, splitModeWidget, customDelimiterWidget);
                updateComboChoiceAvailability();
                bindRandomSelectionCallback(randomSelectionWidget, node, updateComboChoiceAvailability);
                updateCombo();
            })

            // React to text changes
            const originalListCallback = listWidget.callback;
            listWidget.callback = function () {
                if (originalListCallback) {
                    originalListCallback.apply(this, arguments);
                }
                updateCombo();
            };

            // React to split mode changes
            const originalSplitCallback = splitModeWidget.callback;
            splitModeWidget.callback = function () {
                if (originalSplitCallback) {
                    originalSplitCallback.apply(this, arguments);
                }
                syncCustomDelimiterVisibility(node, splitModeWidget, customDelimiterWidget);
                requestAnimationFrame(() => {
                    updateCombo();
                });
            };

            // React to custom delimiter changes
            const originalCustomCallback = customDelimiterWidget.callback;
            customDelimiterWidget.callback = function () {
                if (originalCustomCallback) {
                    originalCustomCallback.apply(this, arguments);
                }
                requestAnimationFrame(() => {
                    updateCombo();
                });
            };
        };

        // Do not connect if disabled or hidden
        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input.widget && input.widget.name) {
                const widget = this.widgets.find(w => w.name === input.widget.name);
                if (widget && (widget.hidden === true || widget.disabled === true)) {
                    return false;
                }
            }
            return onConnectInput?.apply(this, arguments);
        };
    }
});
