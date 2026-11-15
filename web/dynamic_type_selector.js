import { app } from "/scripts/app.js";
import {
    DYNAMIC_INPUT_PREFIX,
    SELECTOR_WEIGHTED_INPUT_NAME,
    addDynamicInput,
    bindRandomSelectionCallback,
    getConnectedDynamicInputs,
    getDynamicInputs,
    getMaxDynamicInputs,
    getWeightedRandomizersLinkedToSelector,
    isDynamicSocketGrowthEnabled,
    isRandomSelectionActive,
    maybeSyncWeightedRandomizerToSelector,
    notifySelectorDynamicInputCountChanged,
    refreshNodeAfterWidgetStateChange,
    registerSettingsSync,
    removeLastDynamicInput,
    showBatchInputDialog,
    syncDynamicSocketGrowth,
    updateWidgetAvailability,
    validateSelection,
} from "./ds_common.js";

function getDynamicTypeSelectorSelectionWidgets(node) {
    return [
        node.widgets?.find(w => w.name === "select"),
        node.widgets?.find(w => w.name === "item_true"),
        node.widgets?.find(w => w.name === "item_false"),
    ];
}

function syncAllDynamicTypeSelectorNodes() {
    const nodes = app.graph?._nodes;
    if (!nodes) return;
    for (const node of nodes) {
        if (node.comfyClass !== "DynamicTypeSelector") continue;
        syncDynamicSocketGrowth(node, getDynamicTypeSelectorSelectionWidgets(node));
    }
}

app.registerExtension({
    name: "Wakaura.DynamicTypeSelector",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DynamicTypeSelector")
            return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            const node = this;

            const selectionWidget = this.widgets.find(w => w.name === "select");
            const useBoolItemWidget = this.widgets.find(w => w.name === "use_bool_item");
            const boolItemWidget = this.widgets.find(w => w.name === "bool_item");
            const boolTrueItemIndexWidget = this.widgets.find(w => w.name === "item_true");
            const boolFalseItemIndexWidget = this.widgets.find(w => w.name === "item_false");
            const selectionWidgets = [selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget];
            const anyMissing = !selectionWidget || !useBoolItemWidget || !boolItemWidget || !boolTrueItemIndexWidget || !boolFalseItemIndexWidget;

            if (anyMissing)
                return;

            function wrapWidgetValidationCallback(widget, arg) {
                if (!widget)
                    return;

                const original = widget.callback;
                widget.callback = function () {
                    if (original) {
                        original.apply(this, arguments);
                    }
                    requestAnimationFrame(() => {
                        validateSelection(widget, arg);
                    });
                };
            }

            const randomSelectionWidget = this.widgets.find(w => w.name === "random_selection");

            function updateSelectionWidgetsAvailability(skipCanvasRefresh = false) {
                const skip = true;
                if (isRandomSelectionActive(node)) {
                    updateWidgetAvailability(node, selectionWidget, true, false, skip);
                    updateWidgetAvailability(node, useBoolItemWidget, true, false, skip);
                    updateWidgetAvailability(node, boolItemWidget, true, false, skip);
                    updateWidgetAvailability(node, boolTrueItemIndexWidget, true, false, skip);
                    updateWidgetAvailability(node, boolFalseItemIndexWidget, true, false, skip);
                } else {
                    const useBoolItem = useBoolItemWidget.value;
                    updateWidgetAvailability(node, useBoolItemWidget, true, true, skip);
                    updateWidgetAvailability(node, selectionWidget, true, !useBoolItem, skip);
                    updateWidgetAvailability(node, boolItemWidget, true, useBoolItem, skip);
                    updateWidgetAvailability(node, boolTrueItemIndexWidget, true, useBoolItem, skip);
                    updateWidgetAvailability(node, boolFalseItemIndexWidget, true, useBoolItem, skip);
                }
                if (!skipCanvasRefresh)
                    refreshNodeAfterWidgetStateChange(node);
            }

            // Initial setup
            requestAnimationFrame(() => {
                updateSelectionWidgetsAvailability();
                bindRandomSelectionCallback(randomSelectionWidget, node, updateSelectionWidgetsAvailability);
                if (isDynamicSocketGrowthEnabled()) {
                    syncDynamicSocketGrowth(node, selectionWidgets);
                }

                // Reset all the ports to wildcards if no inputs are connected.
                const wildcard = "*";
                const hasAnyConnectedInput = getConnectedDynamicInputs(this).length > 0;

                if (!hasAnyConnectedInput) {
                    let hasCleanedAnyInput = false;

                    getDynamicInputs(this).forEach(input => {
                        const hasNoLink = input.link == null || !this.graph?.links?.[input.link];

                        if (hasNoLink) {
                            input.type = wildcard;
                            hasCleanedAnyInput = true;
                        }
                    });

                    if (hasCleanedAnyInput && this.outputs && this.outputs[0]) {
                        this.outputs[0].type = wildcard;
                    }
                }

                // React to use bool item changes
                const originalUseBoolItemCallback = useBoolItemWidget.callback;
                useBoolItemWidget.callback = function () {
                    if (originalUseBoolItemCallback) {
                        originalUseBoolItemCallback.apply(this, arguments);
                    }
                    updateSelectionWidgetsAvailability(true);
                    refreshNodeAfterWidgetStateChange(node);
                };

                // React to bool item changes
                requestAnimationFrame(() => {
                    wrapWidgetValidationCallback(selectionWidget, node);
                    wrapWidgetValidationCallback(boolTrueItemIndexWidget, node);
                    wrapWidgetValidationCallback(boolFalseItemIndexWidget, node);
                });

                validateSelection(selectionWidget, node);
                validateSelection(boolTrueItemIndexWidget, node);
                validateSelection(boolFalseItemIndexWidget, node);
                notifySelectorDynamicInputCountChanged(node);
            });

            return r;
        };

        // Enforce type matching
        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input.name.startsWith(DYNAMIC_INPUT_PREFIX)) {
                const outputType = this.outputs[0].type;
                if (outputType !== "*" && type !== outputType && type !== "*") {
                    return false;
                }
            } else {
                if (input.widget && input.widget.name) {
                    const widget = this.widgets.find(w => w.name === input.widget.name);
                    if (widget && (widget.hidden === true || widget.disabled === true)) {
                        return false;
                    }
                }
            }
            return onConnectInput?.apply(this, arguments);
        };

        // Update output type based on first connected input
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, link, ioSlot) {
            const r = onConnectionsChange?.apply(this, arguments);
            if (type === 1) {
                const input = this.inputs[slotIndex];
                if (input?.name === SELECTOR_WEIGHTED_INPUT_NAME) {
                    const nodeRef = this;
                    requestAnimationFrame(() => {
                        if (isConnected) {
                            for (const wr of getWeightedRandomizersLinkedToSelector(nodeRef)) {
                                wr._wrSyncStateKey = undefined;
                                maybeSyncWeightedRandomizerToSelector(wr);
                            }
                            return;
                        }
                        const linkInfo = nodeRef.graph?.links?.[link];
                        const origin = linkInfo
                            ? nodeRef.graph.getNodeById(linkInfo.origin_id)
                            : null;
                        if (origin) {
                            origin._wrSyncStateKey = undefined;
                            maybeSyncWeightedRandomizerToSelector(origin);
                        }
                    });
                }
            }
            if (type === 1 && this.outputs && this.outputs[0]) { // Input connection changed
                const input = this.inputs[slotIndex];
                if (input && input.name.startsWith(DYNAMIC_INPUT_PREFIX)) {
                    const wildcard = "*";
                    const connectedInputs = getConnectedDynamicInputs(this);
                    if (isConnected && this.outputs[0].type === wildcard) {
                        // First connection attempt: set type based on this input
                        if (this.graph?.links) {
                            const linkInfo = this.graph.links[input.link];
                            if (linkInfo) {
                                const originNode = this.graph.getNodeById(linkInfo.origin_id);
                                if (originNode && originNode.outputs && originNode.outputs[linkInfo.origin_slot]) {
                                    const originOutput = originNode.outputs[linkInfo.origin_slot];
                                    const inputType = originOutput.type;
                                    this.outputs[0].type = inputType;
                                    // Update all input types
                                    for (let i = 0; i < this.inputs.length; i++) {
                                        const curInput = this.inputs[i];
                                        if (curInput.name.startsWith(DYNAMIC_INPUT_PREFIX)) {
                                            curInput.type = inputType;
                                            if (curInput.link != null && this.graph?.links) {
                                                const connectedLinkInfo = this.graph.links[curInput.link];
                                                if (connectedLinkInfo) {
                                                    const connectedNode = this.graph.getNodeById(connectedLinkInfo.origin_id);
                                                    if (connectedNode && connectedNode.outputs && connectedNode.outputs[connectedLinkInfo.origin_slot]) {
                                                        const connectedOutput = connectedNode.outputs[connectedLinkInfo.origin_slot];
                                                        if (connectedOutput.type !== inputType && connectedOutput.type !== wildcard) {
                                                            this.disconnectInput(i);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    // Disconnect incompatible output links
                                    if (this.outputs[0].links && this.outputs[0].links.length > 0 && this.graph?.links) {
                                        const linksToDisconnect = [];
                                        for (const linkId of this.outputs[0].links) {
                                            const outputLinkInfo = this.graph.links[linkId];
                                            if (outputLinkInfo) {
                                                const targetNode = this.graph.getNodeById(outputLinkInfo.target_id);
                                                if (targetNode && targetNode.inputs && targetNode.inputs[outputLinkInfo.target_slot]) {
                                                    const targetInput = targetNode.inputs[outputLinkInfo.target_slot];
                                                    if (targetInput.type !== inputType && targetInput.type !== wildcard && inputType !== wildcard) {
                                                        linksToDisconnect.push(linkId);
                                                    }
                                                }
                                            }
                                        }
                                        for (const linkId of linksToDisconnect) {
                                            this.graph.removeLink(linkId);
                                        }
                                    }
                                }
                            }
                        }
                    } else if (!isConnected && connectedInputs.length === 0) {
                        // No inputs connected anymore, reset to wildcard
                        this.outputs[0].type = wildcard;
                        getDynamicInputs(this).forEach(inp => inp.type = wildcard);
                    }
                    if (isDynamicSocketGrowthEnabled()) {
                        const nodeRef = this;
                        requestAnimationFrame(() => {
                            syncDynamicSocketGrowth(nodeRef, getDynamicTypeSelectorSelectionWidgets(nodeRef));
                        });
                    }
                }
            }
            return r;
        };

        // Add context menu options
        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            const r = origGetExtraMenuOptions?.apply?.(this, arguments);
            if (isDynamicSocketGrowthEnabled()) return r;
            const node = this;

            const selectionWidget = this.widgets.find(w => w.name === "select");
            const boolTrueItemIndexWidget = this.widgets.find(w => w.name === "item_true");
            const boolFalseItemIndexWidget = this.widgets.find(w => w.name === "item_false");

            const allInputs = getDynamicInputs(this);
            const currentCount = allInputs.length;
            const atLimit = currentCount >= getMaxDynamicInputs();
            const moreThanOne = currentCount > 1;

            // Batch Add/Remove Inputs option
            options.unshift({
                content: "Batch Add/Remove Inputs",
                callback: () => {
                    showBatchInputDialog(node, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
                }
            });

            options.unshift({
                content: atLimit ? `Add Input (Max ${getMaxDynamicInputs()} reached)` : "Add Input",
                disabled: atLimit,
                callback: () => {
                    let inputType = (this.outputs && this.outputs[0]) ? this.outputs[0].type : "*";

                    if (addDynamicInput(this, inputType)) {
                        validateSelection(selectionWidget, node);
                        validateSelection(boolTrueItemIndexWidget, node);
                        validateSelection(boolFalseItemIndexWidget, node);
                        notifySelectorDynamicInputCountChanged(node);
                    }
                }
            });
            options.unshift({
                content: "Remove Input",
                disabled: !moreThanOne,
                callback: () => {
                    if (removeLastDynamicInput(this)) {
                        validateSelection(selectionWidget, node);
                        validateSelection(boolTrueItemIndexWidget, node);
                        validateSelection(boolFalseItemIndexWidget, node);
                        notifySelectorDynamicInputCountChanged(node);
                    }
                }
            });
            return r;
        }
    },
});

registerSettingsSync(() => syncAllDynamicTypeSelectorNodes());
