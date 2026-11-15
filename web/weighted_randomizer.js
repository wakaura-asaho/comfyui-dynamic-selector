import { app } from "/scripts/app.js";
import {
    BATCH_MODE_WEIGHTS,
    WEIGHTED_RANDOMIZER_OUTPUT_NAME,
    addDynamicWeightWidget,
    getDynamicWeightWidgets,
    getMaxDynamicInputs,
    isWeightedRandomizerSyncEnabled,
    maybeSyncWeightedRandomizerToSelector,
    registerSettingsSync,
    removeLastDynamicWeightWidget,
    showBatchInputDialog,
} from "./ds_common.js";

function syncAllWeightedRandomizerWeightCounts() {
    if (!isWeightedRandomizerSyncEnabled()) return;
    const nodes = app.graph?._nodes;
    if (!nodes) return;
    for (const node of nodes) {
        if ((node.comfyClass || node.type) !== "WeightedRandomizer") continue;
        node._wrSyncStateKey = undefined;
        maybeSyncWeightedRandomizerToSelector(node);
    }
}

app.registerExtension({
    name: "Wakaura.WeightedRandomizer",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "WeightedRandomizer") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            const node = this;
            requestAnimationFrame(() => {
                if (getDynamicWeightWidgets(node).length === 0) {
                    addDynamicWeightWidget(node, 1);
                }
                node._wrSyncStateKey = undefined;
                maybeSyncWeightedRandomizerToSelector(node);
            });
            return r;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, link, ioSlot) {
            const r = onConnectionsChange?.apply(this, arguments);
            if (type !== 2) return r;
            const output = this.outputs?.[slotIndex];
            if (
                output?.name !== WEIGHTED_RANDOMIZER_OUTPUT_NAME
                && output?.type !== "W_RANDOMIZER"
            ) {
                return r;
            }
            const nodeRef = this;
            requestAnimationFrame(() => {
                nodeRef._wrSyncStateKey = undefined;
                maybeSyncWeightedRandomizerToSelector(nodeRef);
            });
            return r;
        };

        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            const r = origGetExtraMenuOptions?.apply?.(this, arguments);
            if (isWeightedRandomizerSyncEnabled()) return r;
            const node = this;
            const currentCount = getDynamicWeightWidgets(node).length;
            const atLimit = currentCount >= getMaxDynamicInputs();
            const moreThanOne = currentCount > 1;

            options.unshift({
                content: "Batch Add/Remove Weights",
                callback: () => {
                    showBatchInputDialog(node, null, null, null, undefined, BATCH_MODE_WEIGHTS);
                },
            });
            options.unshift({
                content: atLimit
                    ? `Add Weight (Max ${getMaxDynamicInputs()} reached)`
                    : "Add Weight",
                disabled: atLimit,
                callback: () => {
                    addDynamicWeightWidget(node);
                },
            });
            options.unshift({
                content: "Remove Weight",
                disabled: !moreThanOne,
                callback: () => {
                    removeLastDynamicWeightWidget(node);
                },
            });
            return r;
        };
    },
});

registerSettingsSync(() => syncAllWeightedRandomizerWeightCounts());
