import { app } from "/scripts/app.js";

function getDynamicInputs(node) {
    return (node.inputs || []).filter(i => i.name && i.name.startsWith("input_"));
}

function getLastDynamicInput(inputs) {
    if (!inputs || inputs.length === 0) return null;
    return inputs.reduce((a, b) => {
        const numA = parseInt(a.name.match(/\d+$/)?.[0] || "0", 10);
        const numB = parseInt(b.name.match(/\d+$/)?.[0] || "0", 10);
        return numA > numB ? a : b;
    });
}

function getMaxInputIndex(inputs) {
    if (!inputs || inputs.length === 0) return 0;
    return parseInt(getLastDynamicInput(inputs).name.match(/\d+$/)?.[0] || "0", 10);
}

function getConnectedDynamicInputs(node) {
    return getDynamicInputs(node).filter(inp => inp.link != null && node.graph?.links?.[inp.link]);
}

function addDynamicInput(node, maxInputs, inputType) {
    const inputs = getDynamicInputs(node);
    if (inputs.length >= maxInputs) {
        if (app.ui && app.ui.dialog && app.ui.dialog.show) {
            app.ui.dialog.show(`Maximum of ${maxInputs} inputs reached.`);
        }
        return false;
    }
    const newIndex = inputs.length > 0 ? getMaxInputIndex(inputs) + 1 : 0;
    node.addInput("input_" + newIndex, inputType);
    return true;
}

function removeLastDynamicInput(node, showDialog = true) {
    const inputs = getDynamicInputs(node);
    if (inputs.length <= 1) {
        if (showDialog && app.ui && app.ui.dialog && app.ui.dialog.show) {
            app.ui.dialog.show("Can not remove the first input.");
        }
        return false;
    }
    const last = getLastDynamicInput(inputs);
    if (last) {
        node.removeInput(node.inputs.indexOf(last));
        return true;
    }
    return false;
}

function showBatchInputDialog(node, maxInputs, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType) {
    const allInputs = getDynamicInputs(node);
    const currentCount = allInputs.length;

    // Create modal styles
    const modalStyles = `
        .batch-input-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            font-family: Arial, sans-serif;
        }
        .batch-input-dialog {
            background: #1e1e1e;
            border: 1px solid #444;
            border-radius: 8px;
            padding: 20px;
            min-width: 400px;
            max-width: 500px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
            color: #e0e0e0;
        }
        .batch-dialog-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            border-bottom: 1px solid #444;
            padding-bottom: 10px;
        }
        .batch-dialog-info {
            background: #252525;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 13px;
            color: #b0b0b0;
        }
        .batch-dialog-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            border-bottom: 1px solid #444;
        }
        .batch-dialog-tab {
            padding: 8px 15px;
            background: #2d2d2d;
            border: none;
            color: #e0e0e0;
            cursor: pointer;
            border-radius: 4px 4px 0 0;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
        }
        .batch-dialog-tab.active {
            background: #3d3d3d;
            border-bottom: 2px solid #007acc;
        }
        .batch-dialog-tab:hover {
            background: #3d3d3d;
        }
        .batch-dialog-content {
            display: none;
        }
        .batch-dialog-content.active {
            display: block;
        }
        .batch-dialog-section {
            margin-bottom: 15px;
        }
        .batch-dialog-label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #b0b0b0;
            text-transform: uppercase;
        }
        .batch-dialog-input {
            width: 100%;
            padding: 8px 10px;
            background: #2d2d2d;
            border: 1px solid #444;
            color: #e0e0e0;
            border-radius: 4px;
            font-size: 13px;
            box-sizing: border-box;
        }
        .batch-dialog-input:focus {
            outline: none;
            border-color: #007acc;
            background: #333;
        }
        .batch-dialog-presets {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 15px;
        }
        .batch-dialog-preset-btn {
            padding: 8px;
            background: #2d2d2d;
            border: 1px solid #444;
            color: #e0e0e0;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .batch-dialog-preset-btn:hover {
            background: #3d3d3d;
            border-color: #007acc;
        }
        .batch-dialog-error {
            background: #3d1f1f;
            border: 1px solid #8b3333;
            color: #ff6b6b;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 12px;
        }
        .batch-dialog-success {
            background: #1f3d2f;
            border: 1px solid #338b4d;
            color: #6bff9b;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 12px;
        }
        .batch-dialog-buttons {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            padding-top: 15px;
            border-top: 1px solid #444;
        }
        .batch-dialog-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .batch-dialog-btn-apply {
            background: #007acc;
            color: white;
        }
        .batch-dialog-btn-apply:hover {
            background: #0098ff;
        }
        .batch-dialog-btn-apply:disabled {
            background: #444;
            cursor: not-allowed;
            opacity: 0.5;
        }
        .batch-dialog-btn-cancel {
            background: #2d2d2d;
            color: #e0e0e0;
            border: 1px solid #444;
        }
        .batch-dialog-btn-cancel:hover {
            background: #3d3d3d;
        }
    `;

    // Inject styles if not already present
    if (!document.getElementById("batch-input-modal-styles")) {
        const styleElement = document.createElement("style");
        styleElement.id = "batch-input-modal-styles";
        styleElement.textContent = modalStyles;
        document.head.appendChild(styleElement);
    }

    // Create modal HTML
    const modal = document.createElement("div");
    modal.className = "batch-input-modal";

    const dialog = document.createElement("div");
    dialog.className = "batch-input-dialog";

    const title = document.createElement("div");
    title.className = "batch-dialog-title";
    title.textContent = "Batch Add/Remove Inputs";

    const info = document.createElement("div");
    info.className = "batch-dialog-info";
    info.innerHTML = `Current inputs: <strong>${currentCount}</strong> / <strong>${maxInputs}</strong>`;

    // Create tabs
    const tabsContainer = document.createElement("div");
    tabsContainer.className = "batch-dialog-tabs";

    const addTab = document.createElement("button");
    addTab.className = "batch-dialog-tab active";
    addTab.textContent = "Add Inputs";
    addTab.dataset.tab = "add";

    const removeTab = document.createElement("button");
    removeTab.className = "batch-dialog-tab";
    removeTab.textContent = "Remove Inputs";
    removeTab.dataset.tab = "remove";

    tabsContainer.appendChild(addTab);
    tabsContainer.appendChild(removeTab);

    // Create content sections
    const addContent = document.createElement("div");
    addContent.className = "batch-dialog-content active";
    addContent.dataset.tab = "add";

    const addSection = document.createElement("div");
    addSection.className = "batch-dialog-section";

    const addLabel = document.createElement("label");
    addLabel.className = "batch-dialog-label";
    addLabel.textContent = "Quick Add Presets";

    const addPresets = document.createElement("div");
    addPresets.className = "batch-dialog-presets";

    const presetAmounts = [5, 10, 25];
    presetAmounts.forEach(amount => {
        const btn = document.createElement("button");
        btn.className = "batch-dialog-preset-btn";
        btn.textContent = `+${amount}`;
        btn.innerHTML = `+${amount}<br><span style="font-size: 10px; color: #888;">Result: ${currentCount + amount}</span>`;
        btn.onclick = () => {
            const resultCount = currentCount + amount;
            if (resultCount > maxInputs) {
                showAddError(`Cannot add ${amount} inputs. Would exceed maximum of ${maxInputs}.`);
            } else {
                performAddInputs(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType);
                closeModal();
            }
        };
        addPresets.appendChild(btn);
    });

    addSection.appendChild(addLabel);
    addSection.appendChild(addPresets);
    addContent.appendChild(addSection);

    // Custom add amount
    const customAddSection = document.createElement("div");
    customAddSection.className = "batch-dialog-section";

    const customAddLabel = document.createElement("label");
    customAddLabel.className = "batch-dialog-label";
    customAddLabel.textContent = "Custom Amount";

    const customAddInput = document.createElement("input");
    customAddInput.type = "number";
    customAddInput.className = "batch-dialog-input";
    customAddInput.placeholder = "Enter number of inputs to add";
    customAddInput.min = "1";
    customAddInput.max = String(maxInputs - currentCount);
    customAddInput.value = "5";

    customAddSection.appendChild(customAddLabel);
    customAddSection.appendChild(customAddInput);
    addContent.appendChild(customAddSection);

    // Remove content
    const removeContent = document.createElement("div");
    removeContent.className = "batch-dialog-content";
    removeContent.dataset.tab = "remove";

    const removeSection = document.createElement("div");
    removeSection.className = "batch-dialog-section";

    const removeLabel = document.createElement("label");
    removeLabel.className = "batch-dialog-label";
    removeLabel.textContent = "Quick Remove Presets";

    const removePresets = document.createElement("div");
    removePresets.className = "batch-dialog-presets";

    const maxRemove = Math.min(25, currentCount - 1); // Keep at least 1 input
    const removeAmounts = [5, 10, Math.min(25, maxRemove)].filter((v, i, a) => a.indexOf(v) === i && v > 0);

    removeAmounts.forEach(amount => {
        if (amount > currentCount - 1) return;
        const btn = document.createElement("button");
        btn.className = "batch-dialog-preset-btn";
        btn.textContent = `-${amount}`;
        btn.innerHTML = `-${amount}<br><span style="font-size: 10px; color: #888;">Result: ${currentCount - amount}</span>`;
        btn.onclick = () => {
            if (currentCount - amount < 1) {
                showRemoveError(`Cannot remove ${amount} inputs. Must keep at least 1 input.`);
            } else {
                performRemoveInputs(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
                closeModal();
            }
        };
        removePresets.appendChild(btn);
    });

    removeSection.appendChild(removeLabel);
    removeSection.appendChild(removePresets);
    removeContent.appendChild(removeSection);

    // Custom remove amount
    const customRemoveSection = document.createElement("div");
    customRemoveSection.className = "batch-dialog-section";

    const customRemoveLabel = document.createElement("label");
    customRemoveLabel.className = "batch-dialog-label";
    customRemoveLabel.textContent = "Custom Amount";

    const customRemoveInput = document.createElement("input");
    customRemoveInput.type = "number";
    customRemoveInput.className = "batch-dialog-input";
    customRemoveInput.placeholder = "Enter number of inputs to remove";
    customRemoveInput.min = "1";
    customRemoveInput.max = String(currentCount - 1);
    customRemoveInput.value = "5";

    customRemoveSection.appendChild(customRemoveLabel);
    customRemoveSection.appendChild(customRemoveInput);
    removeContent.appendChild(customRemoveSection);

    // Error/success message area
    const messageArea = document.createElement("div");
    messageArea.id = "batch-message-area";

    const showAddError = (msg) => {
        messageArea.innerHTML = `<div class="batch-dialog-error">${msg}</div>`;
    };

    const showRemoveError = (msg) => {
        messageArea.innerHTML = `<div class="batch-dialog-error">${msg}</div>`;
    };

    // Buttons
    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "batch-dialog-buttons";

    const applyBtn = document.createElement("button");
    applyBtn.className = "batch-dialog-btn batch-dialog-btn-apply";
    applyBtn.textContent = "Apply";
    applyBtn.onclick = () => {
        const activeTab = document.querySelector(".batch-dialog-tab.active").dataset.tab;
        messageArea.innerHTML = "";

        if (activeTab === "add") {
            const amount = parseInt(customAddInput.value) || 0;
            if (amount < 1) {
                showAddError("Please enter a valid number greater than 0.");
                return;
            }
            if (currentCount + amount > maxInputs) {
                showAddError(`Cannot add ${amount} inputs. Would exceed maximum of ${maxInputs}. Max to add: ${maxInputs - currentCount}`);
                return;
            }
            performAddInputs(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType);
        } else {
            const amount = parseInt(customRemoveInput.value) || 0;
            if (amount < 1) {
                showRemoveError("Please enter a valid number greater than 0.");
                return;
            }
            if (currentCount - amount < 1) {
                showRemoveError(`Cannot remove ${amount} inputs. Must keep at least 1 input.`);
                return;
            }
            performRemoveInputs(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
        }
        closeModal();
    };

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "batch-dialog-btn batch-dialog-btn-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = closeModal;

    buttonsContainer.appendChild(applyBtn);
    buttonsContainer.appendChild(cancelBtn);

    // Tab switching
    const tabs = [addTab, removeTab];
    const contents = [addContent, removeContent];

    tabs.forEach((tab, index) => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));
            tab.classList.add("active");
            contents[index].classList.add("active");
            messageArea.innerHTML = "";
        };
    });

    // Assemble dialog
    dialog.appendChild(title);
    dialog.appendChild(info);
    dialog.appendChild(tabsContainer);
    dialog.appendChild(addContent);
    dialog.appendChild(removeContent);
    dialog.appendChild(messageArea);
    dialog.appendChild(buttonsContainer);

    modal.appendChild(dialog);

    function closeModal() {
        modal.remove();
    }

    // Close on escape key
    const handleKeyDown = (e) => {
        if (e.key === "Escape") {
            closeModal();
            document.removeEventListener("keydown", handleKeyDown);
        }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
            document.removeEventListener("keydown", handleKeyDown);
        }
    };

    document.body.appendChild(modal);
}

function performAddInputs(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType) {
    let inputType = forcedInputType;
    if (inputType === undefined) {
        inputType = (node.outputs && node.outputs[0]) ? node.outputs[0].type : "*";
    }

    for (let i = 0; i < count; i++) {
        addDynamicInput(node, 9999, inputType); // Max checked beforehand
    }

    validateSelection(selectionWidget, node);
    validateSelection(boolTrueItemIndexWidget, node);
    validateSelection(boolFalseItemIndexWidget, node);
}

function performRemoveInputs(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget) {
    for (let i = 0; i < count; i++) {
        if (!removeLastDynamicInput(node, false)) break;
    }

    validateSelection(selectionWidget, node);
    validateSelection(boolTrueItemIndexWidget, node);
    validateSelection(boolFalseItemIndexWidget, node);
}

function validateSelection(widget, node) {
    if (!widget) return;
    let v = widget.value;
    const allInputs = getDynamicInputs(node);

    if (!allInputs.length)
        return;

    const minIndex = 0;
    const maxIndex = getMaxInputIndex(allInputs);

    const clamped = Math.max(minIndex, Math.min(v ?? 0, maxIndex));

    if (widget.value !== clamped) {
        widget.value = clamped;
    }

    widget.options ||= {};
    widget.options.min = minIndex;
    widget.options.max = maxIndex;

    widget.options.disabled_increment = clamped >= maxIndex;
    widget.options.disabled_decrement = clamped <= minIndex;

    if (app.graph)
        // app.graph._version++;
        app.graph.setDirtyCanvas(true);
}

function updateWidgetAvailability(node, widget, visible, available) {
    if (!widget)
        return;
    const enabled = available ?? visible;
    widget.hidden = !visible;
    widget.disabled = !enabled;
    // const input = node.inputs.find(i => i.name === widget.name);
    // input.hidden = !visible;
    // input.disabled = !enabled;
    app.graph.setDirtyCanvas(true);
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
        nodeType.prototype.onConnectInput = function (targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input.name.startsWith("input_")) {
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
            if (type === 1 && this.outputs && this.outputs[0]) { // Input connection changed
                const input = this.inputs[slotIndex];
                if (input && input.name.startsWith("input_")) {
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
                                        if (curInput.name.startsWith("input_")) {
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

            const allInputs = getDynamicInputs(this);
            const currentCount = allInputs.length;
            const MAX_INPUTS = 99;
            const atLimit = currentCount >= MAX_INPUTS;
            const moreThanOne = currentCount > 1;

            // Batch Add/Remove Inputs option
            options.unshift({
                content: "Batch Add/Remove Inputs",
                callback: () => {
                    showBatchInputDialog(node, MAX_INPUTS, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
                }
            });

            options.unshift({
                content: atLimit ? "Add Input (Max 99 reached)" : "Add Input",
                disabled: atLimit,
                callback: () => {
                    let inputType = (this.outputs && this.outputs[0]) ? this.outputs[0].type : "*";

                    if (addDynamicInput(this, 99, inputType)) {
                        validateSelection(selectionWidget, node);
                        validateSelection(boolTrueItemIndexWidget, node);
                        validateSelection(boolFalseItemIndexWidget, node);
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
            });

            return r;
        };

        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input.name.startsWith("input_")) {
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
            if (!input || !input.name.startsWith("input_")) return r;

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
                            if (!cur.name.startsWith("input_") || i === slotIndex) continue;
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

            return r;
        };

        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            const r = origGetExtraMenuOptions?.apply?.(this, arguments);
            const node = this;
            const MAX_INPUTS = 99;
            const allInputs = getDynamicInputs(this);
            const currentCount = allInputs.length;
            const atLimit = currentCount >= MAX_INPUTS;
            const moreThanOne = currentCount > 1;

            options.unshift({
                content: "Batch Add/Remove Inputs",
                callback: () => {
                    const firstConnected = getConnectedDynamicInputs(node)[0];
                    let inputType = firstConnected ? firstConnected.type : "*";
                    showBatchInputDialog(node, MAX_INPUTS, null, null, null, inputType);
                },
            });

            options.unshift({
                content: atLimit ? "Add Input (Max 99 reached)" : "Add Input",
                disabled: atLimit,
                callback: () => {
                    // Derive the locked type from any connected port
                    const firstConnected = getConnectedDynamicInputs(this)[0];
                    let inputType = firstConnected ? firstConnected.type : "*";
                    addDynamicInput(this, MAX_INPUTS, inputType);
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
                validateSelection(selectGroupWidget, node);
                wrapClamp(selectGroupWidget);
            });

            return r;
        };

        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input.name.startsWith("input_")) {
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
            if (!input?.name.startsWith("input_")) return r;

            const selectGroupWidget = this.widgets.find(w => w.name === "select_group");
            validateSelection(selectGroupWidget, this);

            return r;
        };

        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            const r = origGetExtraMenuOptions?.apply?.(this, arguments);
            const node = this;
            const MAX_INPUTS = 99;
            const allInputs = getDynamicInputs(this);
            const currentCount = allInputs.length;
            const atLimit = currentCount >= MAX_INPUTS;
            const moreThanOne = currentCount > 1;

            const selectGroupWidget = this.widgets.find(w => w.name === "select_group");

            options.unshift({
                content: "Batch Add/Remove Group Inputs",
                callback: () => showBatchInputDialog(node, MAX_INPUTS, selectGroupWidget, null, null, "GROUP"),
            });

            options.unshift({
                content: atLimit ? "Add Group Input (Max 99 reached)" : "Add Group Input",
                disabled: atLimit,
                callback: () => {
                    if (addDynamicInput(this, MAX_INPUTS, "GROUP")) {
                        validateSelection(selectGroupWidget, node);
                    }
                },
            });

            options.unshift({
                content: "Remove Group Input",
                disabled: !moreThanOne,
                callback: () => {
                    if (removeLastDynamicInput(this)) {
                        validateSelection(selectGroupWidget, node);
                    }
                },
            });

            return r;
        };
    },
});
