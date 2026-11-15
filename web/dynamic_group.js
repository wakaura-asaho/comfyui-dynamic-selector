import { app } from "/scripts/app.js";
import {
    DYNAMIC_INPUT_PREFIX,
    addDynamicInput,
    getConnectedDynamicInputs,
    getDynamicInputs,
    getMaxDynamicInputs,
    isDynamicSocketGrowthEnabled,
    registerSettingsSync,
    removeLastDynamicInput,
    showBatchInputDialog,
    syncDynamicSocketGrowth,
} from "./ds_common.js";

function syncAllDynamicGroupNodes() {
    const nodes = app.graph?._nodes;
    if (!nodes) return;
    for (const node of nodes) {
        if (node.comfyClass !== "DynamicGroup") continue;
        syncDynamicSocketGrowth(node, []);
    }
}

app.registerExtension({
    name: "Wakaura.DynamicGroup",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DynamicGroup")
            return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            const node = this;

            requestAnimationFrame(() => {
                const wildcard = "*";
                const hasAnyConnected = getConnectedDynamicInputs(this).length > 0;
                if (!hasAnyConnected) {
                    getDynamicInputs(this).forEach(inp => {
                        if (inp.link == null || !this.graph?.links?.[inp.link]) {
                            inp.type = wildcard;
                        }
                    });
                    // Output remains "GROUP" — it's always a group regardless of inner type.
                }
                if (isDynamicSocketGrowthEnabled()) {
                    syncDynamicSocketGrowth(node, []);
                }
            });

            return r;
        };

        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input.name.startsWith(DYNAMIC_INPUT_PREFIX)) {
                // Find the type already in use from any connected input
                const firstConnected = getConnectedDynamicInputs(this)[0];
                if (firstConnected) {
                    const lockedType = firstConnected.type;
                    if (lockedType !== "*" && type !== lockedType && type !== "*") {
                        return false; // Reject mismatched type
                    }
                }
            }
            return onConnectInput?.apply(this, arguments);
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, link, ioSlot) {
            const r = onConnectionsChange?.apply(this, arguments);
            if (type !== 1) return r; // Only care about input-side changes

            const input = this.inputs[slotIndex];
            if (!input || !input.name.startsWith(DYNAMIC_INPUT_PREFIX)) return r;

            const wildcard = "*";
            const connectedInputs = getConnectedDynamicInputs(this);

            if (isConnected && this.graph?.links) {
                const linkInfo = this.graph.links[input.link];
                if (linkInfo) {
                    const originNode = this.graph.getNodeById(linkInfo.origin_id);
                    if (originNode?.outputs?.[linkInfo.origin_slot]) {
                        const newType = originNode.outputs[linkInfo.origin_slot].type;
                        // Lock all input_N ports to this type
                        getDynamicInputs(this).forEach(inp => inp.type = newType);
                        // Disconnect any already-connected inputs with a different type
                        for (let i = 0; i < this.inputs.length; i++) {
                            const cur = this.inputs[i];
                            if (!cur.name.startsWith(DYNAMIC_INPUT_PREFIX) || i === slotIndex) continue;
                            if (cur.link != null && this.graph?.links) {
                                const cl = this.graph.links[cur.link];
                                if (cl) {
                                    const cn = this.graph.getNodeById(cl.origin_id);
                                    if (cn?.outputs?.[cl.origin_slot]) {
                                        const ct = cn.outputs[cl.origin_slot].type;
                                        if (ct !== newType && ct !== wildcard) {
                                            this.disconnectInput(i);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (!isConnected && connectedInputs.length === 0) {
                // All inputs disconnected — reset to wildcard
                getDynamicInputs(this).forEach(inp => inp.type = wildcard);
            }

            if (isDynamicSocketGrowthEnabled()) {
                const nodeRef = this;
                requestAnimationFrame(() => {
                    syncDynamicSocketGrowth(nodeRef, []);
                });
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

            options.unshift({
                content: "Batch Add/Remove Inputs",
                callback: () => {
                    const firstConnected = getConnectedDynamicInputs(node)[0];
                    let inputType = firstConnected ? firstConnected.type : "*";
                    showBatchInputDialog(node, null, null, null, inputType);
                },
            });

            options.unshift({
                content: atLimit ? `Add Input (Max ${getMaxDynamicInputs()} reached)` : "Add Input",
                disabled: atLimit,
                callback: () => {
                    // Derive the locked type from any connected port
                    const firstConnected = getConnectedDynamicInputs(this)[0];
                    let inputType = firstConnected ? firstConnected.type : "*";
                    addDynamicInput(this, inputType);
                },
            });

            options.unshift({
                content: "Remove Input",
                disabled: !moreThanOne,
                callback: () => {
                    removeLastDynamicInput(this);
                },
            });

            return r;
        };
    },
});

registerSettingsSync(() => syncAllDynamicGroupNodes());
