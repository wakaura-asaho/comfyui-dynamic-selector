import { app } from "/scripts/app.js";
import { ComfyWidgets } from "/scripts/widgets.js";
import {
    BATCH_MODE_DICTIONARY,
    DYNAMIC_INPUT_PREFIX,
    DYNAMIC_KEY_PREFIX,
    SELECTOR_WEIGHTED_INPUT_NAME,
    bindRandomSelectionCallback,
    countTrailingEmptyDynamicInputs,
    getDynamicInputNumber,
    getDynamicInputs,
    getLastDynamicInput,
    getMaxDynamicInputs,
    getMaxInputIndex,
    getOptionalDynamicInputExtra,
    getWeightedRandomizersLinkedToSelector,
    hasGapBetweenConnectedDynamicInputs,
    isAutoCollapseEmptyInputsEnabled,
    isDynamicInputConnected,
    isDynamicSocketGrowthEnabled,
    isRandomSelectionActive,
    markDynamicInputsOptional,
    maybeSyncWeightedRandomizerToSelector,
    notifySelectorDynamicInputCountChanged,
    refreshNodeAfterWidgetStateChange,
    registerBatchHandler,
    registerSettingsSync,
    removeAllDynamicInputs,
    showBatchInputDialog,
    syncPromotedChoiceComboHostOptions,
    updateWidgetAvailability,
} from "./ds_common.js";

function syncAllDynamicDictionaryNodes() {
    const nodes = app.graph?._nodes;
    if (!nodes) return;
    for (const node of nodes) {
        if (node.comfyClass !== "DynamicDictionary") continue;
        syncDictionarySocketGrowth(node);
    }
}

function getDynamicKeyWidgets(node) {
    return (node.widgets || []).filter(
        (w) => w.name && w.name.startsWith(DYNAMIC_KEY_PREFIX),
    );
}

function getDynamicKeyNumber(widget) {
    return parseInt(widget.name.slice(DYNAMIC_KEY_PREFIX.length) || "0", 10);
}

function getDictionaryKeyRect(node, index, slotY) {
    const x = 34;
    const h = 18;
    const y = slotY - h * 0.5;
    const rightSpace = 68;
    const w = Math.max(50, (node.size?.[0] || 220) - x - rightSpace);
    return [x, y, w, h];
}

function truncateKeyText(ctx, text, maxWidth) {
    if (maxWidth <= 0 || !text) return "";
    if (ctx.measureText(text).width <= maxWidth) return text;
    const ellipsis = "…";
    let len = text.length;
    while (len > 0 && ctx.measureText(text.slice(0, len) + ellipsis).width > maxWidth) {
        len--;
    }
    return len > 0 ? text.slice(0, len) + ellipsis : "";
}

function isVueNodesEnabled() {
    const fromSetting = app.ui?.settings?.getSettingValue?.("Comfy.VueNodes.Enabled");
    if (typeof fromSetting === "boolean") return fromSetting;
    return window.LiteGraph?.vueNodesMode === true;
}

function installVueNodesModeHook() {
    const lg = window.LiteGraph;
    if (!lg || lg._dictVueModeHook) return;
    let mode = lg.vueNodesMode === true;
    Object.defineProperty(lg, "vueNodesMode", {
        configurable: true,
        enumerable: true,
        get() {
            return mode;
        },
        set(value) {
            const next = value === true;
            if (next === mode) return;
            mode = next;
            refreshDynamicKeyWidgetPresentation(next);
        },
    });
    lg._dictVueModeHook = true;
}

function isBlankKeyPaint(fn) {
    return typeof fn === "function" && fn._dictBlank === true;
}

function rememberDynamicKeyCanvasHooks(widget) {
    if (widget._dictCanvasHooks) return;
    widget._dictCanvasHooks = {
        computeSize: isBlankKeyPaint(widget.computeSize) ? undefined : widget.computeSize,
        drawWidget: isBlankKeyPaint(widget.drawWidget) ? undefined : widget.drawWidget,
    };
}

function showDynamicKeyWidgetForVue(widget) {
    const hooks = widget._dictCanvasHooks;
    if (hooks?.computeSize) widget.computeSize = hooks.computeSize;
    else delete widget.computeSize;
    if (hooks?.drawWidget) widget.drawWidget = hooks.drawWidget;
    else delete widget.drawWidget;
    // A draw() function selects the blank legacy canvas in Nodes 2.0.
    widget.draw = undefined;
    widget._dictCanvasHidden = false;
}

function hideDynamicKeyWidgetForCanvas(widget) {
    widget._dictCanvasHidden = true;
    const computeSize = () => [0, -4];
    computeSize._dictBlank = true;
    const drawWidget = () => {};
    drawWidget._dictBlank = true;
    widget.computeSize = computeSize;
    widget.drawWidget = drawWidget;
    widget.draw = undefined;
}

function detachDynamicKeyInputSlot(node, widget) {
    if (widget._dictSlotRemoved) return;
    const keyInputSlot = node.inputs?.findIndex(
        (inp) => inp.name === widget.name || inp.widget?.name === widget.name,
    );
    if (keyInputSlot !== undefined && keyInputSlot >= 0) {
        node.removeInput(keyInputSlot);
    }
    widget._dictSlotRemoved = true;
}

function applyDynamicKeyWidgetMode(node, widget, vueEnabled) {
    rememberDynamicKeyCanvasHooks(widget);
    detachDynamicKeyInputSlot(node, widget);
    const vue = vueEnabled ?? isVueNodesEnabled();
    if (vue) {
        showDynamicKeyWidgetForVue(widget);
        return;
    }
    hideDynamicKeyWidgetForCanvas(widget);
}

function refreshDynamicKeyWidgetPresentation(vueEnabled) {
    const nodes = app.graph?._nodes;
    if (!nodes) return;
    const vue = vueEnabled ?? isVueNodesEnabled();
    for (const node of nodes) {
        if (node.comfyClass !== "DynamicDictionary") continue;
        for (const widget of getDynamicKeyWidgets(node)) {
            applyDynamicKeyWidgetMode(node, widget, vue);
        }
        node.setSize?.(node.computeSize?.());
    }
    app.graph?.setDirtyCanvas(true, true);
}

function configureDynamicKeyWidget(node, widget, index) {
    if (!widget) return widget;
    widget._dictIndex = index;
    applyDynamicKeyWidgetMode(node, widget);
    if (!widget._dictCallbackBound) {
        widget._dictCallbackBound = true;
        const origCallback = widget.callback;
        widget.callback = function () {
            const prev = widget._prevKeyVal;
            origCallback?.apply(this, arguments);
            widget._prevKeyVal = widget.value;
            syncDictionaryKeyCombos(node, prev, widget.value);
            syncDictionaryOutputType(node);
        };
    }
    widget._prevKeyVal = widget.value;
    return widget;
}

function ensureDynamicKeyWidget(node, index, defaultValue) {
    const name = `${DYNAMIC_KEY_PREFIX}${index}`;
    const defVal = defaultValue ?? name;
    let widget = node.widgets?.find((w) => w.name === name);
    if (!widget) {
        const created = ComfyWidgets.STRING(
            node,
            name,
            ["STRING", { default: defVal }],
            app,
        );
        widget = created?.widget ?? node.widgets?.find((w) => w.name === name);
    }
    if (widget) {
        if (defaultValue !== undefined) {
            widget.value = defaultValue;
        } else if (widget.value === undefined || widget.value === null || widget.value === "") {
            widget.value = defVal;
        }
        configureDynamicKeyWidget(node, widget, index);
    }
    return widget;
}

function syncDictionarySlotLabels(node) {
    for (const inp of getDynamicInputs(node)) {
        const idx = getDynamicInputNumber(inp);
        const label = String(idx);
        inp.label = label;
        inp.localized_name = label;
    }
}

function getResolvedDictionaryKey(node, index) {
    const w = node.widgets?.find((widget) => widget.name === `${DYNAMIC_KEY_PREFIX}${index}`);
    const raw = typeof w?.value === "string" ? w.value.trim() : "";
    return raw || `${DYNAMIC_KEY_PREFIX}${index}`;
}

function getDictionaryKeyList(node) {
    const inputs = getDynamicInputs(node).sort(
        (a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b),
    );
    return inputs.map((inp) => getResolvedDictionaryKey(node, getDynamicInputNumber(inp)));
}

function isTypeStrictActive(node) {
    const w = node.widgets?.find((widget) => widget.name === "type_strict");
    if (!w) return false;
    return w.value === true || w.value === "true" || w.value === 1;
}

function getDictionarySelectedIndex(node) {
    const useBoolWidget = node.widgets?.find((w) => w.name === "use_bool_item");
    const boolItemWidget = node.widgets?.find((w) => w.name === "bool_item");
    const selectionWidget = node.widgets?.find((w) => w.name === "selection");
    const itemTrueWidget = node.widgets?.find((w) => w.name === "item_true");
    const itemFalseWidget = node.widgets?.find((w) => w.name === "item_false");

    const useBool = useBoolWidget?.value === true || useBoolWidget?.value === "true" || useBoolWidget?.value === 1;
    const boolVal = boolItemWidget?.value === true || boolItemWidget?.value === "true" || boolItemWidget?.value === 1;
    const activeWidget = useBool ? (boolVal ? itemTrueWidget : itemFalseWidget) : selectionWidget;
    const targetKey = typeof activeWidget?.value === "string" ? activeWidget.value.trim() : "";

    const inputs = getDynamicInputs(node).sort(
        (a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b),
    );
    for (const inp of inputs) {
        const idx = getDynamicInputNumber(inp);
        if (getResolvedDictionaryKey(node, idx) === targetKey) {
            return idx;
        }
    }
    return inputs.length > 0 ? getDynamicInputNumber(inputs[0]) : 0;
}

function getConnectedOriginOutputType(node, input) {
    if (!input || input.link == null || !node.graph?.links) return null;
    const linkInfo = node.graph.links[input.link];
    if (!linkInfo) return null;
    const originNode = node.graph.getNodeById(linkInfo.origin_id);
    const originOutput = originNode?.outputs?.[linkInfo.origin_slot];
    return originOutput?.type ?? null;
}

function syncDictionaryKeyCombos(node, renamedFrom, renamedTo) {
    const keys = getDictionaryKeyList(node);
    const comboNames = ["selection", "item_true", "item_false"];
    for (const name of comboNames) {
        const w = node.widgets?.find((widget) => widget.name === name);
        if (!w) continue;
        w.options ||= {};
        w.options.values = keys;
        if (renamedFrom !== undefined && renamedTo !== undefined && w.value === renamedFrom) {
            w.value = renamedTo.trim() || keys[0] || `${DYNAMIC_KEY_PREFIX}0`;
        }
        if (!keys.includes(w.value)) {
            w.value = keys[0] ?? `${DYNAMIC_KEY_PREFIX}0`;
        }
        syncPromotedChoiceComboHostOptions(w);
    }
    app.graph?.setDirtyCanvas(true, true);
}

function syncDictionaryOutputType(node) {
    if (!node.outputs?.[0]) return;
    const wildcard = "*";
    const inputs = getDynamicInputs(node).sort(
        (a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b),
    );

    const input0 = inputs.find((inp) => getDynamicInputNumber(inp) === 0);
    const input0OriginType = getConnectedOriginOutputType(node, input0);
    const strict = isTypeStrictActive(node);

    for (const inp of inputs) {
        const originType = getConnectedOriginOutputType(node, inp);
        if (strict && input0OriginType && input0OriginType !== wildcard) {
            inp.type = input0OriginType;
        } else {
            inp.type = originType ?? wildcard;
        }
    }

    if (strict && input0OriginType && input0OriginType !== wildcard) {
        for (let i = 0; i < node.inputs.length; i++) {
            const cur = node.inputs[i];
            if (!cur.name?.startsWith(DYNAMIC_INPUT_PREFIX)) continue;
            const ct = getConnectedOriginOutputType(node, cur);
            if (ct && ct !== input0OriginType && ct !== wildcard) {
                node.disconnectInput(i);
                cur.type = input0OriginType;
            }
        }
    }

    let resolvedOutType = wildcard;
    if (isRandomSelectionActive(node)) {
        const connectedTypes = new Set();
        for (const inp of inputs) {
            const t = getConnectedOriginOutputType(node, inp);
            if (t) connectedTypes.add(t);
        }
        if (connectedTypes.size === 1) {
            resolvedOutType = [...connectedTypes][0];
        } else {
            resolvedOutType = wildcard;
        }
    } else {
        const selectedIdx = getDictionarySelectedIndex(node);
        const selectedInp = inputs.find((inp) => getDynamicInputNumber(inp) === selectedIdx);
        resolvedOutType = getConnectedOriginOutputType(node, selectedInp) ?? wildcard;
    }

    node.outputs[0].type = resolvedOutType;

    if (resolvedOutType !== wildcard && node.outputs[0].links?.length && node.graph?.links) {
        const toDisconnect = [];
        for (const linkId of node.outputs[0].links) {
            const linkInfo = node.graph.links[linkId];
            if (!linkInfo) continue;
            const targetNode = node.graph.getNodeById(linkInfo.target_id);
            const targetInput = targetNode?.inputs?.[linkInfo.target_slot];
            if (targetInput && targetInput.type !== resolvedOutType && targetInput.type !== wildcard) {
                toDisconnect.push(linkId);
            }
        }
        for (const linkId of toDisconnect) {
            node.graph.removeLink(linkId);
        }
    }

    app.graph?.setDirtyCanvas(true, true);
}

function addDictionaryEntry(node, keyText) {
    const inputs = getDynamicInputs(node);
    if (inputs.length >= getMaxDynamicInputs()) {
        if (app.ui?.dialog?.show) {
            app.ui.dialog.show(`Maximum of ${getMaxDynamicInputs()} inputs reached.`);
        }
        return false;
    }
    const newIndex = inputs.length > 0 ? getMaxInputIndex(inputs) + 1 : 0;
    const input0 = node.inputs?.find((inp) => inp.name === `${DYNAMIC_INPUT_PREFIX}0`);
    const strictType = isTypeStrictActive(node) ? getConnectedOriginOutputType(node, input0) : null;
    const slotType = strictType || "*";
    const extra = {
        ...getOptionalDynamicInputExtra(node),
        label: String(newIndex),
        localized_name: String(newIndex),
    };
    node.addInput(`${DYNAMIC_INPUT_PREFIX}${newIndex}`, slotType, extra);
    ensureDynamicKeyWidget(node, newIndex, keyText ?? `${DYNAMIC_KEY_PREFIX}${newIndex}`);
    syncDictionarySlotLabels(node);
    syncDictionaryKeyCombos(node);
    syncDictionaryOutputType(node);
    node.setSize?.(node.computeSize?.());
    notifySelectorDynamicInputCountChanged(node);
    return true;
}

function removeLastDictionaryEntry(node, showDialog = true) {
    const inputs = getDynamicInputs(node);
    if (inputs.length <= 1) {
        if (showDialog && app.ui?.dialog?.show) {
            app.ui.dialog.show("Can not remove the first input.");
        }
        return false;
    }
    const last = getLastDynamicInput(inputs);
    if (!last) return false;
    const idx = getDynamicInputNumber(last);
    const slotIndex = node.inputs.indexOf(last);
    if (slotIndex >= 0) {
        if (isDynamicInputConnected(node, last)) node.disconnectInput(slotIndex);
        node.removeInput(slotIndex);
    }
    const keyName = `${DYNAMIC_KEY_PREFIX}${idx}`;
    const wIdx = node.widgets?.findIndex((w) => w.name === keyName) ?? -1;
    if (wIdx >= 0) {
        node.widgets.splice(wIdx, 1);
    }
    syncDictionarySlotLabels(node);
    syncDictionaryKeyCombos(node);
    syncDictionaryOutputType(node);
    node.setSize?.(node.computeSize?.());
    notifySelectorDynamicInputCountChanged(node);
    return true;
}

function performAddDictionaryEntries(node, count) {
    for (let i = 0; i < count; i++) {
        if (!addDictionaryEntry(node)) break;
    }
}

function performRemoveDictionaryEntries(node, count) {
    for (let i = 0; i < count; i++) {
        if (!removeLastDictionaryEntry(node, false)) break;
    }
}

function restructureDictionaryEntries(node, entries, trailingEmptyCount) {
    const targetCount = Math.max(
        1,
        Math.min(getMaxDynamicInputs(), entries.length + trailingEmptyCount),
    );
    const oldKeysBySlot = new Map();
    for (const w of getDynamicKeyWidgets(node)) {
        oldKeysBySlot.set(getDynamicKeyNumber(w), w.value);
    }

    removeAllDynamicInputs(node);
    for (const w of getDynamicKeyWidgets(node)) {
        const idx = node.widgets.indexOf(w);
        if (idx >= 0) node.widgets.splice(idx, 1);
    }

    const inputExtra = getOptionalDynamicInputExtra(node);
    for (let i = 0; i < targetCount; i++) {
        const entry = entries[i];
        const keyVal = entry
            ? entry.keyValue
            : (oldKeysBySlot.get(i) ?? `${DYNAMIC_KEY_PREFIX}${i}`);
        node.addInput(`${DYNAMIC_INPUT_PREFIX}${i}`, "*", {
            ...inputExtra,
            label: String(i),
            localized_name: String(i),
        });
        ensureDynamicKeyWidget(node, i, keyVal);
    }

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const origin = node.graph?.getNodeById(entry.origin_id);
        if (!origin?.connect) continue;
        const slot = node.inputs.findIndex((inp) => inp.name === `${DYNAMIC_INPUT_PREFIX}${i}`);
        if (slot < 0) continue;
        origin.connect(entry.origin_slot, node, slot);
    }
}

function syncDictionarySocketGrowth(node) {
    if (!isDynamicSocketGrowthEnabled() || node._syncingDynamicInputs) return;
    node._syncingDynamicInputs = true;
    try {
        const autoCollapse = isAutoCollapseEmptyInputsEnabled();
        const sorted = getDynamicInputs(node).sort(
            (a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b),
        );
        const connectionEntries = [];
        for (const inp of sorted) {
            if (!isDynamicInputConnected(node, inp)) continue;
            const link = node.graph.links[inp.link];
            const idx = getDynamicInputNumber(inp);
            const kw = node.widgets?.find((w) => w.name === `${DYNAMIC_KEY_PREFIX}${idx}`);
            connectionEntries.push({
                origin_id: link.origin_id,
                origin_slot: link.origin_slot,
                keyValue: kw?.value ?? `${DYNAMIC_KEY_PREFIX}${idx}`,
            });
        }
        const connectedCount = connectionEntries.length;
        const trailingEmpty = connectedCount >= getMaxDynamicInputs() ? 0 : 1;
        const targetCount = Math.max(
            1,
            Math.min(getMaxDynamicInputs(), connectedCount + trailingEmpty),
        );
        const allOccupied =
            connectedCount > 0
            && connectedCount === sorted.length
            && sorted.length < getMaxDynamicInputs();
        if (allOccupied) {
            addDictionaryEntry(node);
        } else if (autoCollapse) {
            const needsCompact =
                hasGapBetweenConnectedDynamicInputs(node)
                || countTrailingEmptyDynamicInputs(node) !== trailingEmpty
                || sorted.length !== targetCount
                || sorted.some((inp, i) => getDynamicInputNumber(inp) !== i);
            if (needsCompact) {
                restructureDictionaryEntries(node, connectionEntries, trailingEmpty);
            }
        }
        syncDictionarySlotLabels(node);
        markDynamicInputsOptional(node);
        syncDictionaryKeyCombos(node);
        syncDictionaryOutputType(node);
        node.setSize?.(node.computeSize?.());
        notifySelectorDynamicInputCountChanged(node);
    } finally {
        node._syncingDynamicInputs = false;
        app.graph?.setDirtyCanvas(true, true);
    }
}

app.registerExtension({
    name: "Wakaura.DynamicDictionary",

    setup() {
        installVueNodesModeHook();
        app.ui?.settings?.addEventListener?.("Comfy.VueNodes.Enabled.change", (e) => {
            refreshDynamicKeyWidgetPresentation(e?.detail?.value === true);
        });
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DynamicDictionary")
            return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            const node = this;

            const selectionWidget = this.widgets?.find((w) => w.name === "selection");
            const useBoolItemWidget = this.widgets?.find((w) => w.name === "use_bool_item");
            const boolItemWidget = this.widgets?.find((w) => w.name === "bool_item");
            const itemTrueWidget = this.widgets?.find((w) => w.name === "item_true");
            const itemFalseWidget = this.widgets?.find((w) => w.name === "item_false");
            const randomSelectionWidget = this.widgets?.find((w) => w.name === "random_selection");
            const typeStrictWidget = this.widgets?.find((w) => w.name === "type_strict");

            for (const inp of getDynamicInputs(node)) {
                const idx = getDynamicInputNumber(inp);
                ensureDynamicKeyWidget(node, idx);
            }
            syncDictionarySlotLabels(node);
            markDynamicInputsOptional(node);

            function updateDictWidgetsAvailability(skipCanvasRefresh = false) {
                const skip = true;
                if (isRandomSelectionActive(node)) {
                    updateWidgetAvailability(node, selectionWidget, true, false, skip);
                    updateWidgetAvailability(node, useBoolItemWidget, true, false, skip);
                    updateWidgetAvailability(node, boolItemWidget, true, false, skip);
                    updateWidgetAvailability(node, itemTrueWidget, true, false, skip);
                    updateWidgetAvailability(node, itemFalseWidget, true, false, skip);
                } else {
                    const useBool = useBoolItemWidget?.value === true
                        || useBoolItemWidget?.value === "true"
                        || useBoolItemWidget?.value === 1;
                    updateWidgetAvailability(node, useBoolItemWidget, true, true, skip);
                    updateWidgetAvailability(node, selectionWidget, true, !useBool, skip);
                    updateWidgetAvailability(node, boolItemWidget, true, useBool, skip);
                    updateWidgetAvailability(node, itemTrueWidget, true, useBool, skip);
                    updateWidgetAvailability(node, itemFalseWidget, true, useBool, skip);
                }
                if (!skipCanvasRefresh) {
                    refreshNodeAfterWidgetStateChange(node);
                }
            }

            function bindOutputTypeRefresh(widget) {
                if (!widget) return;
                const orig = widget.callback;
                widget.callback = function () {
                    orig?.apply(this, arguments);
                    syncDictionaryKeyCombos(node);
                    syncDictionaryOutputType(node);
                    refreshNodeAfterWidgetStateChange(node);
                };
            }

            requestAnimationFrame(() => {
                for (const inp of getDynamicInputs(node)) {
                    const idx = getDynamicInputNumber(inp);
                    ensureDynamicKeyWidget(node, idx);
                }
                syncDictionarySlotLabels(node);
                markDynamicInputsOptional(node);
                syncDictionaryKeyCombos(node);
                updateDictWidgetsAvailability();
                syncDictionaryOutputType(node);

                bindRandomSelectionCallback(randomSelectionWidget, node, (skipRefresh) => {
                    updateDictWidgetsAvailability(skipRefresh);
                    syncDictionaryOutputType(node);
                });

                if (useBoolItemWidget) {
                    const origUseBool = useBoolItemWidget.callback;
                    useBoolItemWidget.callback = function () {
                        origUseBool?.apply(this, arguments);
                        updateDictWidgetsAvailability(true);
                        syncDictionaryOutputType(node);
                        refreshNodeAfterWidgetStateChange(node);
                    };
                }

                bindOutputTypeRefresh(selectionWidget);
                bindOutputTypeRefresh(boolItemWidget);
                bindOutputTypeRefresh(itemTrueWidget);
                bindOutputTypeRefresh(itemFalseWidget);
                bindOutputTypeRefresh(typeStrictWidget);

                if (isDynamicSocketGrowthEnabled()) {
                    syncDictionarySocketGrowth(node);
                } else {
                    notifySelectorDynamicInputCountChanged(node);
                }
                node.setSize?.(node.computeSize?.());
            });

            return r;
        };

        const origComputeSize = nodeType.prototype.computeSize;
        nodeType.prototype.computeSize = function (out) {
            const size = origComputeSize ? origComputeSize.apply(this, arguments) : [220, 100];
            size[0] = Math.max(size[0], 240);
            return size;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const r = onConfigure?.apply(this, arguments);
            const node = this;
            const named = info?.widgets_values_named;
            const dynInputs = getDynamicInputs(node).sort(
                (a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b),
            );
            for (const inp of dynInputs) {
                const idx = getDynamicInputNumber(inp);
                const keyName = `${DYNAMIC_KEY_PREFIX}${idx}`;
                const restoredVal = named && Object.prototype.hasOwnProperty.call(named, keyName)
                    ? named[keyName]
                    : undefined;
                ensureDynamicKeyWidget(node, idx, restoredVal);
            }
            if (!named && Array.isArray(info?.widgets_values) && node.widgets) {
                let posIdx = 0;
                for (const w of node.widgets) {
                    if (w.serialize === false) continue;
                    if (posIdx < info.widgets_values.length && info.widgets_values[posIdx] !== undefined) {
                        w.value = info.widgets_values[posIdx];
                    }
                    posIdx++;
                }
            }
            for (const w of getDynamicKeyWidgets(node)) {
                w._prevKeyVal = w.value;
            }
            syncDictionarySlotLabels(node);
            markDynamicInputsOptional(node);
            syncDictionaryKeyCombos(node);
            syncDictionaryOutputType(node);
            return r;
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            const r = onDrawForeground?.apply(this, arguments);
            if (!isVueNodesEnabled() && getDynamicKeyWidgets(this).some((w) => !w._dictCanvasHidden)) {
                const node = this;
                for (const widget of getDynamicKeyWidgets(node)) {
                    applyDynamicKeyWidgetMode(node, widget, false);
                }
                requestAnimationFrame(() => node.setSize?.(node.computeSize?.()));
            }
            if (this.flags?.collapsed || isVueNodesEnabled()) return r;
            const lowQuality = (app.canvas?.ds?.scale || 1) < 0.5;
            const slotHeight = window.LiteGraph?.NODE_SLOT_HEIGHT || 20;
            const bgColor = window.LiteGraph?.WIDGET_BGCOLOR || "#222";
            const outlineColor = window.LiteGraph?.WIDGET_OUTLINE_COLOR || "#666";
            const textColor = window.LiteGraph?.WIDGET_TEXT_COLOR || "#DDD";
            const startY = this.constructor?.slot_start_y || 0;

            ctx.save();
            let nonWidgetSlotIdx = 0;
            for (let i = 0; i < (this.inputs?.length || 0); i++) {
                const inp = this.inputs[i];
                if (inp.widget) continue;
                const slotY = startY + (nonWidgetSlotIdx + 0.7) * slotHeight;
                nonWidgetSlotIdx++;
                if (!inp.name?.startsWith(DYNAMIC_INPUT_PREFIX)) continue;

                const idx = getDynamicInputNumber(inp);
                const [bx, by, bw, bh] = getDictionaryKeyRect(this, idx, slotY);

                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(bx, by, bw, bh, [4]);
                } else {
                    ctx.rect(bx, by, bw, bh);
                }
                ctx.fillStyle = bgColor;
                ctx.fill();
                if (!lowQuality) {
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = outlineColor;
                    ctx.stroke();

                    const kw = this.widgets?.find((w) => w.name === `${DYNAMIC_KEY_PREFIX}${idx}`);
                    const rawText = typeof kw?.value === "string" ? kw.value : `${DYNAMIC_KEY_PREFIX}${idx}`;
                    const displayText = truncateKeyText(ctx, rawText, bw - 12);
                    if (displayText) {
                        ctx.fillStyle = textColor;
                        ctx.font = `normal ${window.LiteGraph?.NODE_SUBTEXT_SIZE || 12}px ${window.LiteGraph?.NODE_FONT || "Inter"}`;
                        ctx.textAlign = "left";
                        ctx.textBaseline = "middle";
                        ctx.fillText(displayText, bx + 6, by + bh * 0.5);
                    }
                }
            }
            ctx.restore();
            return r;
        };

        const onMouseDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function (e, pos, canvas) {
            if (!isVueNodesEnabled() && !this.flags?.collapsed && this.inputs) {
                const slotHeight = window.LiteGraph?.NODE_SLOT_HEIGHT || 20;
                const startY = this.constructor?.slot_start_y || 0;
                let nonWidgetSlotIdx = 0;
                for (let i = 0; i < this.inputs.length; i++) {
                    const inp = this.inputs[i];
                    if (inp.widget) continue;
                    const slotY = startY + (nonWidgetSlotIdx + 0.7) * slotHeight;
                    nonWidgetSlotIdx++;
                    if (!inp.name?.startsWith(DYNAMIC_INPUT_PREFIX)) continue;

                    const idx = getDynamicInputNumber(inp);
                    const [bx, by, bw, bh] = getDictionaryKeyRect(this, idx, slotY);
                    if (
                        pos[0] >= bx
                        && pos[0] <= bx + bw
                        && pos[1] >= by
                        && pos[1] <= by + bh
                    ) {
                        const kw = ensureDynamicKeyWidget(this, idx);
                        const currentVal = typeof kw?.value === "string" ? kw.value : `${DYNAMIC_KEY_PREFIX}${idx}`;
                        canvas.prompt(
                            `Key ${idx}`,
                            currentVal,
                            (v) => {
                                if (v !== null && kw) {
                                    const oldVal = kw.value;
                                    const nextVal = v.trim() || `${DYNAMIC_KEY_PREFIX}${idx}`;
                                    kw.value = nextVal;
                                    kw.callback?.(nextVal, canvas, this, pos, e);
                                    this.onWidgetChanged?.(kw.name, nextVal, oldVal, kw);
                                    this.graph?.setDirtyCanvas(true, true);
                                }
                            },
                            e,
                            false,
                        );
                        return true;
                    }
                }
            }
            return onMouseDown?.apply(this, arguments);
        };

        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (targetSlot, type, output, originNode, originSlot) {
            const input = this.inputs[targetSlot];
            if (input?.name?.startsWith(DYNAMIC_INPUT_PREFIX)) {
                if (isTypeStrictActive(this)) {
                    const input0 = this.inputs.find((inp) => inp.name === `${DYNAMIC_INPUT_PREFIX}0`);
                    const input0Type = getConnectedOriginOutputType(this, input0);
                    if (
                        input.name !== `${DYNAMIC_INPUT_PREFIX}0`
                        && input0Type
                        && input0Type !== "*"
                        && type !== input0Type
                        && type !== "*"
                    ) {
                        return false;
                    }
                }
            } else if (input?.widget?.name) {
                const widget = this.widgets?.find((w) => w.name === input.widget.name);
                if (widget && (widget.hidden === true || widget.disabled === true)) {
                    return false;
                }
            }
            return onConnectInput?.apply(this, arguments);
        };

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
                if (input?.name?.startsWith(DYNAMIC_INPUT_PREFIX)) {
                    const idx = getDynamicInputNumber(input);
                    ensureDynamicKeyWidget(this, idx);
                    syncDictionarySlotLabels(this);
                    syncDictionaryKeyCombos(this);
                    syncDictionaryOutputType(this);
                    if (isDynamicSocketGrowthEnabled()) {
                        const nodeRef = this;
                        requestAnimationFrame(() => {
                            syncDictionarySocketGrowth(nodeRef);
                        });
                    } else {
                        notifySelectorDynamicInputCountChanged(this);
                    }
                }
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
                    showBatchInputDialog(node, null, null, null, undefined, BATCH_MODE_DICTIONARY);
                },
            });

            options.unshift({
                content: atLimit ? `Add Input (Max ${getMaxDynamicInputs()} reached)` : "Add Input",
                disabled: atLimit,
                callback: () => {
                    addDictionaryEntry(this);
                },
            });

            options.unshift({
                content: "Remove Input",
                disabled: !moreThanOne,
                callback: () => {
                    removeLastDictionaryEntry(this);
                },
            });

            return r;
        };
    },
});

registerBatchHandler(BATCH_MODE_DICTIONARY, {
    add(node, count) {
        performAddDictionaryEntries(node, count);
    },
    remove(node, count) {
        performRemoveDictionaryEntries(node, count);
    },
});

registerSettingsSync(() => syncAllDynamicDictionaryNodes());
