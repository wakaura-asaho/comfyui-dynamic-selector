import { app } from "/scripts/app.js";

function validateSelection(widget, node) {
    let v = widget.value;
    const allInputs = node.inputs.filter(({ name }) => name.startsWith("input_"));

    if (!allInputs.length)
        return;

    const indices = allInputs.map(i => {
        const match = i.name.match(/\d+$/);
        return match ? parseInt(match[0]) : 0;
    });

    const minIndex = 0;
    const maxIndex = Math.max(...indices);

    const clamped = Math.max(minIndex, Math.min(v, maxIndex));

    if (widget.value !== clamped) {
        widget.value = clamped;
    }

    widget.options ||= {};
    widget.options.min = minIndex;
    widget.options.max = maxIndex;

    widget.options.disabled_increment = clamped >= maxIndex;
    widget.options.disabled_decrement = clamped <= minIndex;

    if (app.graph)
        app.graph._version++;
    app.graph.setDirtyCanvas(true, true);
}

function updateWidgetAvailability(node, widget, visible, available) {
    if (!widget)
        return;
    const enabled = available ?? visible;
    widget.hidden = !visible;
    widget.disabled = !enabled;
    const input = node.inputs.find(i => i.name === widget.name);
    input.hidden = !visible;
    input.disabled = !enabled;
    app.graph.setDirtyCanvas(true, true);
}

app.registerExtension({
	name: "Wakaura.DynamicTypeSelector",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DynamicTypeSelector")
            return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const r = onNodeCreated?.apply(this, arguments);
            const node = this;

            const selectionWidget = this.widgets.find(w => w.name === "select");
            const useBoolItemWidget = this.widgets.find(w => w.name === "use_bool_item");
            const boolItemWidget = this.widgets.find(w => w.name === "bool_item");
            const boolTrueItemIndexWidget = this.widgets.find(w => w.name === "item_true");
            const boolFalseItemIndexWidget = this.widgets.find(w => w.name === "item_false");
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

            function updateBoolWidgtsAvailability() {
                const useBoolItem = useBoolItemWidget.value;
                updateWidgetAvailability(node, selectionWidget, true, !useBoolItem);
                updateWidgetAvailability(node, boolItemWidget, true, useBoolItem);
                updateWidgetAvailability(node, boolTrueItemIndexWidget, true, useBoolItem);
                updateWidgetAvailability(node, boolFalseItemIndexWidget, true, useBoolItem);
            }

            // Initial setup
            requestAnimationFrame(() => {
                updateBoolWidgtsAvailability();

                // Reset all the ports to wildcards if nothing is connected.
                const wildcard = "*";
                const isOutputUnconnected = !this.outputs[0].links || this.outputs[0].links.length === 0;

                if (isOutputUnconnected) {
                    let hasCleanedAnyInput = false;

                    this.inputs?.forEach(input => {
                        const hasNoLink = input.link === null || input.link === undefined || !this.graph.links[input.link];
                        
                        if (input.name.startsWith("input_") && hasNoLink) {
                            input.type = wildcard;
                            hasCleanedAnyInput = true;
                        }
                    });

                    if (hasCleanedAnyInput || isOutputUnconnected) {
                        this.outputs[0].type = wildcard;
                    }
                }

                // React to use bool item changes
                const originalUseBoolItemCallback = useBoolItemWidget.callback;
                useBoolItemWidget.callback = function () {
                    if (originalUseBoolItemCallback) {
                        originalUseBoolItemCallback.apply(this, arguments);
                    }
                    requestAnimationFrame(() => {
                        const useBoolItem = useBoolItemWidget.value;
                        updateBoolWidgtsAvailability();
                    });
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
            });

            return r;   
        };

        // Enforce type matching
        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function(targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input.name.startsWith("input_")) {
                if (input.name !== "input_0" && this.inputs.length > 0) {
                    const input0 = this.inputs.find(i => i.name === "input_0");
                    if (input0 && input0.type !== "*" && input0.link) {
                        if (type !== input0.type && type !== "*") {
                            return false;
                        }
                    }
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

        // Update output type based on input_0
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(type, slotIndex, isConnected, link, ioSlot) {
            const r = onConnectionsChange?.apply(this, arguments);
            if (type === 1) { // Input connection changed
                const input0 = this.inputs?.find(i => i.name === "input_0");
                const wildcard = "*";
                if (input0 && input0.link) {
                    const linkInfo = this.graph.links[input0.link];
                    if (linkInfo) {
                        const originNode = this.graph.getNodeById(linkInfo.origin_id);
                        const originOutput = originNode.outputs[linkInfo.origin_slot];
                        const inputType = originOutput.type;
                        if (this.outputs[0].type !== inputType) {
                            this.outputs[0].type = inputType;
                            if (this.outputs[0].links && this.outputs[0].links.length > 0) {
                                const linksToDisconnect = [];
                                for (const linkId of this.outputs[0].links) {
                                    const outputLinkInfo = this.graph.links[linkId];
                                    if (outputLinkInfo) {
                                        const targetNode = this.graph.getNodeById(outputLinkInfo.target_id);
                                        const targetInput = targetNode.inputs[outputLinkInfo.target_slot];
                                        if (targetInput.type !== inputType && targetInput.type !== wildcard && inputType !== wildcard) {
                                            linksToDisconnect.push(linkId);
                                        }
                                    }
                                }
                                for (const linkId of linksToDisconnect) {
                                    this.graph.removeLink(linkId);
                                }
                            }
                        }
                        for (let i = 0; i < this.inputs.length; i++) {
                            const curInput = this.inputs[i];
                            if (curInput.name.startsWith("input_")) {
                                if (curInput.type !== inputType) {
                                    curInput.type = inputType;
                                    if (curInput.link != null) {
                                        const connectedLinkInfo = this.graph.links[curInput.link];
                                        if (connectedLinkInfo) {
                                            const connectedNode = this.graph.getNodeById(connectedLinkInfo.origin_id);
                                            const connectedOutput = connectedNode.outputs[connectedLinkInfo.origin_slot];
                                            if (connectedOutput.type !== inputType && connectedOutput.type !== wildcard) {
                                                this.disconnectInput(i);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    if (this.outputs[0].type !== wildcard) {
                        this.outputs[0].type = wildcard;
                        for (let i = 0; i < this.inputs.length; i++) {
                            const curInput = this.inputs[i];
                            if (curInput.name.startsWith("input_") && curInput.type !== wildcard) {
                                curInput.type = wildcard;
                            }
                        }
                    }
                }
            }
            return r;
        };

        // Add context menu options
        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            const r = origGetExtraMenuOptions?.apply?.(this, arguments);
            const node = this;

            const selectionWidget = this.widgets.find(w => w.name === "select");
            const boolTrueItemIndexWidget = this.widgets.find(w => w.name === "item_true");
            const boolFalseItemIndexWidget = this.widgets.find(w => w.name === "item_false");

            const allInputs = this.inputs.filter(({ name }) => name.startsWith("input_"));
            const currentCount = allInputs.length;
            const MAX_INPUTS = 99;
            const atLimit = currentCount >= MAX_INPUTS;
            const moreThanOne = currentCount > 1;

            options.unshift({
                content: atLimit ? "Add Input (Max 99 reached)" : "Add Input",
                disabled: atLimit,
                callback: () => {
                    const allInputs = this.inputs.filter(({ name }) => name.startsWith("input_"));
                    if (allInputs.length >= 99) {
                        app.ui.dialog.show("Maximum of 99 inputs reached.");
                        return;
                    }

                    let inputType = "*";
                    const input0 = this.inputs.find(i => i.name === "input_0");

                    if (input0 && input0.link) {
                        const linkInfo = this.graph.links[input0.link];
                        if (linkInfo) {
                            const originNode = this.graph.getNodeById(linkInfo.origin_id);
                            const originOutput = originNode.outputs[linkInfo.origin_slot];
                            inputType = originOutput.type;
                        }
                    }

                    const newIndex = allInputs.length;
                    this.addInput("input_" + newIndex, inputType);

                    validateSelection(selectionWidget, node);
                    validateSelection(boolTrueItemIndexWidget, node);
                    validateSelection(boolFalseItemIndexWidget, node);
                }
            });
            options.unshift({
                content: "Remove Input",
                disabled: !moreThanOne,
                callback: () => {
                    const allInputs = this.inputs.filter(({ name }) => name.startsWith("input_"));
                    if (allInputs.length <= 1) {
                        app.ui.dialog.show("Can not remove the first input.");
                        return;
                    }

                    if (allInputs.length > 1) {
                        const lastInput = Object.values(allInputs).reduce((a, b) => 
                            Number(a.name.match(/\d+$/)[0]) > Number(b.name.match(/\d+$/)[0]) ? a : b
                        );
                        if (lastInput) {
                            this.removeInput(this.inputs.indexOf(lastInput));
                            validateSelection(selectionWidget, node);
                            validateSelection(boolTrueItemIndexWidget, node);
                            validateSelection(boolFalseItemIndexWidget, node);
                        }
                    }
                }
            });
            return r;
        }
    },
});

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
                app.graph.setDirtyCanvas(true);
            };

            // Initial setup
            requestAnimationFrame(() => {
                const mode = splitModeWidget.value;
                updateWidgetAvailability(node, customDelimiterWidget, mode === "custom" || mode === "regex");
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
                const mode = splitModeWidget.value;
                updateWidgetAvailability(node, customDelimiterWidget, mode === "custom" || mode === "regex");
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
        nodeType.prototype.onConnectInput = function(targetSlot, type, output, originNode, originSlot) {
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
