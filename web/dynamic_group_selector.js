import { app } from "/scripts/app.js";
import {
    DYNAMIC_INPUT_PREFIX,
    addDynamicInput,
    bindRandomSelectionCallback,
    getDynamicInputs,
    getMaxDynamicInputs,
    isDynamicSocketGrowthEnabled,
    isRandomSelectionActive,
    notifySelectorDynamicInputCountChanged,
    refreshNodeAfterWidgetStateChange,
    registerSettingsSync,
    removeLastDynamicInput,
    showBatchInputDialog,
    syncDynamicSocketGrowth,
    updateWidgetAvailability,
    validateSelection,
} from "./ds_common.js";

function getDynamicGroupSelectorSelectionWidgets(node) {
    return [node.widgets?.find(w => w.name === "select_group")];
}

function syncAllDynamicGroupSelectorNodes() {
    const nodes = app.graph?._nodes;
    if (!nodes) return;
    for (const node of nodes) {
        if (node.comfyClass !== "DynamicGroupSelector") continue;
        syncDynamicSocketGrowth(
            node,
            getDynamicGroupSelectorSelectionWidgets(node),
            "GROUP",
        );
    }
}

app.registerExtension({
    name: "Wakaura.DynamicGroupSelector",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DynamicGroupSelector")
            return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            const node = this;

            const selectGroupWidget = this.widgets.find(w => w.name === "select_group");
            const indexWidget = this.widgets.find(w => w.name === "index");
            const randomSelectionWidget = this.widgets.find(w => w.name === "random_selection");

            function updateGroupSelectionWidgetsAvailability(skipCanvasRefresh = false) {
                const enabled = !isRandomSelectionActive(node);
                updateWidgetAvailability(node, selectGroupWidget, true, enabled, true);
                updateWidgetAvailability(node, indexWidget, true, enabled, true);
                if (!skipCanvasRefresh)
                    refreshNodeAfterWidgetStateChange(node);
            }

            // Wrap a widget's callback so it re-clamps after every change.
            function wrapClamp(widget) {
                if (!widget) return;
                const original = widget.callback;
                widget.callback = function () {
                    original?.apply(this, arguments);
                    requestAnimationFrame(() => validateSelection(widget, node));
                };
            }

            requestAnimationFrame(() => {
                updateGroupSelectionWidgetsAvailability();
                bindRandomSelectionCallback(randomSelectionWidget, node, updateGroupSelectionWidgetsAvailability);
                if (isDynamicSocketGrowthEnabled()) {
                    syncDynamicSocketGrowth(
                        node,
                        getDynamicGroupSelectorSelectionWidgets(node),
                        "GROUP",
                    );
                }
                validateSelection(selectGroupWidget, node);
                wrapClamp(selectGroupWidget);
                if (indexWidget) wrapClamp(indexWidget);
            });

            return r;
        };

        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input.name.startsWith(DYNAMIC_INPUT_PREFIX)) {
                // Only accept GROUP connections
                if (type !== "GROUP" && type !== "*") {
                    return false;
                }
            }
            return onConnectInput?.apply(this, arguments);
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, link, ioSlot) {
            const r = onConnectionsChange?.apply(this, arguments);
            if (type !== 1) return r; // Only input-side changes

            const input = this.inputs[slotIndex];
            if (!input?.name.startsWith(DYNAMIC_INPUT_PREFIX)) return r;

            const selectGroupWidget = this.widgets.find(w => w.name === "select_group");
            validateSelection(selectGroupWidget, this);

            if (isDynamicSocketGrowthEnabled()) {
                const nodeRef = this;
                requestAnimationFrame(() => {
                    syncDynamicSocketGrowth(
                        nodeRef,
                        getDynamicGroupSelectorSelectionWidgets(nodeRef),
                        "GROUP",
                    );
                });
            } else {
                notifySelectorDynamicInputCountChanged(this);
            }

            return r;
        };

        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            const r = origGetExtraMenuOptions?.apply?.(this, arguments);
            if (isDynamicSocketGrowthEnabled()) return r;
            const node = this;
            const allInputs = getDynamicInputs(this);
            const currentCount = allInputs.length;
            const atLimit = currentCount >= getMaxDynamicInputs();
            const moreThanOne = currentCount > 1;

            const selectGroupWidget = this.widgets.find(w => w.name === "select_group");

            options.unshift({
                content: "Batch Add/Remove Group Inputs",
                callback: () => showBatchInputDialog(node, selectGroupWidget, null, null, "GROUP"),
            });

            options.unshift({
                content: atLimit ? `Add Group Input (Max ${getMaxDynamicInputs()} reached)` : "Add Group Input",
                disabled: atLimit,
                callback: () => {
                    if (addDynamicInput(this, "GROUP")) {
                        validateSelection(selectGroupWidget, node);
                        notifySelectorDynamicInputCountChanged(node);
                    }
                },
            });

            options.unshift({
                content: "Remove Group Input",
                disabled: !moreThanOne,
                callback: () => {
                    if (removeLastDynamicInput(this)) {
                        validateSelection(selectGroupWidget, node);
                        notifySelectorDynamicInputCountChanged(node);
                    }
                },
            });

            return r;
        };
    },
});

registerSettingsSync(() => syncAllDynamicGroupSelectorNodes());
