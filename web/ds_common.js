import { app } from "/scripts/app.js";
import { api } from "../../scripts/api.js";
import { ComfyWidgets } from "/scripts/widgets.js";

const MAX_DYNAMIC_INPUTS = 99;
export const DYNAMIC_INPUT_PREFIX = "input_";
export const DYNAMIC_KEY_PREFIX = "key_";
const OPTIONAL_INPUT_SHAPE = 7; // LiteGraph RenderShape.HollowCircle
export const BATCH_MODE_SOCKETS = "sockets";
export const BATCH_MODE_WEIGHTS = "weights";
export const BATCH_MODE_DICTIONARY = "dictionary";
const MAX_DYNAMIC_INPUTS_SETTINGS_API = "/api/wakaura/dynamic-selector/settings";

let _maxDynamicInputs = MAX_DYNAMIC_INPUTS;

export function getMaxDynamicInputs() {
    return _maxDynamicInputs;
}

async function loadMaxDynamicInputsFromBackend() {
    const _parseMaxDynamicInputs = (value) => {
        const n = typeof value === "number" ? value : parseInt(value, 10);
        if (!Number.isFinite(n) || n < 1) return null;
        return Math.floor(n);
    }

    try {
        const res = await api.fetchApi(MAX_DYNAMIC_INPUTS_SETTINGS_API);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const parsed = _parseMaxDynamicInputs(data?.max_inputs);
        if (parsed === null) {
            throw new Error(`Invalid max_inputs: ${data?.max_inputs}`);
        }
        _maxDynamicInputs = parsed;
    } catch (err) {
        _maxDynamicInputs = MAX_DYNAMIC_INPUTS; // fallback
        console.error(
            "[DynamicSelector] Failed to load max_inputs from backend; using fallback.",
            err,
        );
    }
}

const maxDynamicInputsReady = loadMaxDynamicInputsFromBackend();

export function getDynamicInputs(node) {
    return (node.inputs || []).filter(i => i.name && i.name.startsWith(DYNAMIC_INPUT_PREFIX));
}

export function getOptionalDynamicInputExtra(node) {
    const ref = node.inputs?.find((i) => i.name === `${DYNAMIC_INPUT_PREFIX}0`);
    const shape = ref?.shape ?? OPTIONAL_INPUT_SHAPE;
    return { shape };
}

export function markDynamicInputsOptional(node) {
    const { shape } = getOptionalDynamicInputExtra(node);
    for (const inp of getDynamicInputs(node)) {
        inp.shape = shape;
    }
}

export function getDynamicWeightWidgets(node) {
    return (node.widgets || []).filter(
        (w) => w.name && w.name.startsWith(DYNAMIC_INPUT_PREFIX),
    );
}

export function getLastDynamicWeightWidget(widgets) {
    if (!widgets || widgets.length === 0) return null;
    return widgets.reduce((a, b) => {
        const numA = parseInt(a.name.match(/\d+$/)?.[0] || "0", 10);
        const numB = parseInt(b.name.match(/\d+$/)?.[0] || "0", 10);
        return numA > numB ? a : b;
    });
}

export function getMaxWeightWidgetIndex(widgets) {
    if (!widgets || widgets.length === 0) return 0;
    return parseInt(
        getLastDynamicWeightWidget(widgets).name.match(/\d+$/)?.[0] || "0",
        10,
    );
}

export function weightWidgetIntSpec(defaultValue = 1) {
    return [
        "INT",
        {
            default: defaultValue,
            min: 0,
            max: getMaxDynamicInputs(),
            step: 1,
        },
    ];
}

export function addDynamicWeightWidget(node, defaultValue = 1) {
    const widgets = getDynamicWeightWidgets(node);
    if (widgets.length >= getMaxDynamicInputs()) {
        if (app.ui?.dialog?.show) {
            app.ui.dialog.show(`Maximum of ${getMaxDynamicInputs()} weights reached.`);
        }
        return false;
    }
    const newIndex = widgets.length > 0 ? getMaxWeightWidgetIndex(widgets) + 1 : 0;
    const name = DYNAMIC_INPUT_PREFIX + newIndex;
    if (node.widgets?.some((w) => w.name === name)) return false;
    const created = ComfyWidgets.INT(node, name, weightWidgetIntSpec(defaultValue), app);
    if (!created?.widget) return false;
    node.setSize?.(node.computeSize?.());
    app.graph?.setDirtyCanvas(true, true);
    return true;
}

export function removeLastDynamicWeightWidget(node, showDialog = true) {
    const widgets = getDynamicWeightWidgets(node);
    if (widgets.length <= 1) {
        if (showDialog && app.ui?.dialog?.show) {
            app.ui.dialog.show("Can not remove the first weight.");
        }
        return false;
    }
    const last = getLastDynamicWeightWidget(widgets);
    if (!last) return false;
    const widgetIndex = node.widgets.indexOf(last);
    if (widgetIndex >= 0) node.widgets.splice(widgetIndex, 1);
    const inputSlot = node.inputs?.findIndex(
        (inp) => inp.name === last.name || inp.widget?.name === last.name,
    );
    if (inputSlot >= 0) node.removeInput(inputSlot);
    node.setSize?.(node.computeSize?.());
    app.graph?.setDirtyCanvas(true, true);
    return true;
}

export function getLastDynamicInput(inputs) {
    if (!inputs || inputs.length === 0) return null;
    return inputs.reduce((a, b) => {
        const numA = parseInt(a.name.match(/\d+$/)?.[0] || "0", 10);
        const numB = parseInt(b.name.match(/\d+$/)?.[0] || "0", 10);
        return numA > numB ? a : b;
    });
}

export function getMaxInputIndex(inputs) {
    if (!inputs || inputs.length === 0) return 0;
    return parseInt(getLastDynamicInput(inputs).name.match(/\d+$/)?.[0] || "0", 10);
}

export function getConnectedDynamicInputs(node) {
    return getDynamicInputs(node).filter(inp => inp.link != null && node.graph?.links?.[inp.link]);
}

export function getDynamicInputNumber(input) {
    return parseInt(input.name.match(/\d+$/)?.[0] || "0", 10);
}

export function isDynamicInputConnected(node, input) {
    return input.link != null && node.graph?.links?.[input.link];
}

export function isDynamicSocketGrowthEnabled() {
    return window.__WakauraDynamicSelector?.isDynamicSocketGrowthEnabled?.() === true;
}

export function isAutoCollapseEmptyInputsEnabled() {
    return window.__WakauraDynamicSelector?.isAutoCollapseEmptyInputsEnabled?.() !== false;
}

export function isWeightedRandomizerSyncEnabled() {
    return window.__WakauraDynamicSelector?.isWeightedRandomizerSyncEnabled?.() === true;
}

export const WEIGHTED_RANDOMIZER_OUTPUT_NAME = "weighted_randomizer";
export const SELECTOR_WEIGHTED_INPUT_NAME = "weighted_randomizer";
const SYNCABLE_SELECTOR_TYPES = new Set([
    "DynamicTypeSelector",
    "DynamicGroupSelector",
    "DynamicDictionary",
]);

export function getLinkedSelectorsForRandomizer(randomizerNode) {
    const graph = randomizerNode.graph;
    if (!graph?.links) return [];
    const output = randomizerNode.outputs?.find(
        (o) => o.name === WEIGHTED_RANDOMIZER_OUTPUT_NAME || o.type === "W_RANDOMIZER",
    );
    if (!output?.links?.length) return [];
    const selectors = [];
    const seen = new Set();
    for (const linkId of output.links) {
        const link = graph.links[linkId];
        if (!link) continue;
        const target = graph.getNodeById(link.target_id);
        if (!target || seen.has(target.id)) continue;
        const nodeType = target.comfyClass || target.type;
        if (!SYNCABLE_SELECTOR_TYPES.has(nodeType)) continue;
        const input = target.inputs?.[link.target_slot];
        if (input?.name !== SELECTOR_WEIGHTED_INPUT_NAME) continue;
        seen.add(target.id);
        selectors.push(target);
    }
    return selectors;
}

export function getWeightedRandomizerSyncSnapshot(randomizerNode) {
    const selectors = getLinkedSelectorsForRandomizer(randomizerNode);
    if (!selectors.length) {
        return { selectorIds: [], maxInputCount: null };
    }
    const selectorIds = selectors.map((s) => s.id).sort((a, b) => a - b);
    let maxInputCount = 0;
    for (const selector of selectors) {
        maxInputCount = Math.max(maxInputCount, getDynamicInputs(selector).length);
    }
    return { selectorIds, maxInputCount };
}

export function weightedRandomizerSyncStateKey(snapshot) {
    return `${snapshot.selectorIds.join(",")}|${snapshot.maxInputCount ?? ""}`;
}

export function getWeightedRandomizersLinkedToSelector(selectorNode) {
    const graph = selectorNode.graph;
    const input = selectorNode.inputs?.find((i) => i.name === SELECTOR_WEIGHTED_INPUT_NAME);
    if (!input?.link || !graph?.links) return [];
    const link = graph.links[input.link];
    if (!link) return [];
    const origin = graph.getNodeById(link.origin_id);
    if (!origin || (origin.comfyClass || origin.type) !== "WeightedRandomizer") return [];
    return [origin];
}

export function setWeightWidgetCount(node, targetCount) {
    const clamped = Math.max(1, Math.min(getMaxDynamicInputs(), targetCount));
    let widgets = getDynamicWeightWidgets(node);
    while (widgets.length < clamped) {
        if (!addDynamicWeightWidget(node)) break;
        widgets = getDynamicWeightWidgets(node);
    }
    while (widgets.length > clamped) {
        if (!removeLastDynamicWeightWidget(node, false)) break;
        widgets = getDynamicWeightWidgets(node);
    }
}

export function maybeSyncWeightedRandomizerToSelector(randomizerNode) {
    if (!isWeightedRandomizerSyncEnabled()) return;
    const snapshot = getWeightedRandomizerSyncSnapshot(randomizerNode);
    const stateKey = weightedRandomizerSyncStateKey(snapshot);
    const prevKey = randomizerNode._wrSyncStateKey;
    if (prevKey === stateKey) return;
    randomizerNode._wrSyncStateKey = stateKey;
    if (snapshot.maxInputCount === null) return;
    if (randomizerNode._syncingWeightCount) return;
    randomizerNode._syncingWeightCount = true;
    try {
        setWeightWidgetCount(randomizerNode, snapshot.maxInputCount);
    } finally {
        randomizerNode._syncingWeightCount = false;
        randomizerNode._wrSyncStateKey = weightedRandomizerSyncStateKey(
            getWeightedRandomizerSyncSnapshot(randomizerNode),
        );
    }
    app.graph?.setDirtyCanvas(true, true);
}

export function notifySelectorDynamicInputCountChanged(selectorNode) {
    const nodeType = selectorNode.comfyClass || selectorNode.type;
    if (!SYNCABLE_SELECTOR_TYPES.has(nodeType)) return;
    for (const wr of getWeightedRandomizersLinkedToSelector(selectorNode)) {
        maybeSyncWeightedRandomizerToSelector(wr);
    }
}

export function getDynamicInputType(node) {
    const connected = getConnectedDynamicInputs(node)[0];
    if (connected) return connected.type;
    if (node.outputs?.[0]) return node.outputs[0].type;
    return "*";
}

export function hasGapBetweenConnectedDynamicInputs(node) {
    const inputs = getDynamicInputs(node).sort((a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b));
    let sawEmpty = false;
    for (const inp of inputs) {
        if (isDynamicInputConnected(node, inp)) {
            if (sawEmpty) return true;
        } else {
            sawEmpty = true;
        }
    }
    return false;
}

export function countTrailingEmptyDynamicInputs(node) {
    const inputs = getDynamicInputs(node).sort((a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b));
    let count = 0;
    for (let i = inputs.length - 1; i >= 0; i--) {
        if (isDynamicInputConnected(node, inputs[i])) break;
        count++;
    }
    return count;
}

export function remapIndexAfterCompact(oldIndex, oldIndicesInOrder) {
    const newIndex = oldIndicesInOrder.indexOf(oldIndex);
    return newIndex >= 0 ? newIndex : oldIndex;
}

export function applyIndexRemapToWidgets(node, oldIndicesInOrder, widgets) {
    for (const widget of widgets) {
        if (!widget) continue;
        const remapped = remapIndexAfterCompact(widget.value ?? 0, oldIndicesInOrder);
        if (widget.value !== remapped) widget.value = remapped;
    }
    for (const widget of widgets) validateSelection(widget, node);
}

export function removeAllDynamicInputs(node) {
    const inputs = getDynamicInputs(node).sort((a, b) => getDynamicInputNumber(b) - getDynamicInputNumber(a));
    for (const inp of inputs) {
        const slot = node.inputs.indexOf(inp);
        if (slot < 0) continue;
        if (isDynamicInputConnected(node, inp)) node.disconnectInput(slot);
        node.removeInput(slot);
    }
}

export function restructureDynamicInputs(node, inputType, connectionEntries, trailingEmptyCount) {
    const targetCount = Math.max(1, Math.min(getMaxDynamicInputs(), connectionEntries.length + trailingEmptyCount));
    removeAllDynamicInputs(node);
    const inputExtra = getOptionalDynamicInputExtra(node);
    for (let i = 0; i < targetCount; i++) {
        node.addInput(DYNAMIC_INPUT_PREFIX + i, inputType, inputExtra);
    }
    for (let i = 0; i < connectionEntries.length; i++) {
        const entry = connectionEntries[i];
        const origin = node.graph?.getNodeById(entry.origin_id);
        if (!origin?.connect) continue;
        const slot = node.inputs.findIndex(inp => inp.name === DYNAMIC_INPUT_PREFIX + i);
        if (slot < 0) continue;
        origin.connect(entry.origin_slot, node, slot);
    }
}

export function syncDynamicSocketGrowth(node, selectionWidgets, forcedInputType) {
    if (!isDynamicSocketGrowthEnabled() || node._syncingDynamicInputs) return;
    node._syncingDynamicInputs = true;
    try {
        const autoCollapse = isAutoCollapseEmptyInputsEnabled();
        const inputType = forcedInputType ?? getDynamicInputType(node);
        const sorted = getDynamicInputs(node).sort((a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b));
        const connectionEntries = [];
        const oldIndicesInOrder = [];
        for (const inp of sorted) {
            if (!isDynamicInputConnected(node, inp)) continue;
            const link = node.graph.links[inp.link];
            connectionEntries.push({
                origin_id: link.origin_id,
                origin_slot: link.origin_slot,
            });
            oldIndicesInOrder.push(getDynamicInputNumber(inp));
        }
        const connectedCount = connectionEntries.length;
        const trailingEmpty = connectedCount >= getMaxDynamicInputs() ? 0 : 1;
        const targetCount = Math.max(1, Math.min(getMaxDynamicInputs(), connectedCount + trailingEmpty));
        const allOccupied = connectedCount > 0 && connectedCount === sorted.length && sorted.length < getMaxDynamicInputs();
        if (allOccupied) {
            addDynamicInput(node, inputType);
        } else if (autoCollapse) {
            const needsCompact =
                hasGapBetweenConnectedDynamicInputs(node) ||
                countTrailingEmptyDynamicInputs(node) !== trailingEmpty ||
                sorted.length !== targetCount ||
                sorted.some((inp, i) => getDynamicInputNumber(inp) !== i);
            if (needsCompact) {
                applyIndexRemapToWidgets(node, oldIndicesInOrder, selectionWidgets);
                restructureDynamicInputs(node, inputType, connectionEntries, trailingEmpty);
                applyIndexRemapToWidgets(node, oldIndicesInOrder, selectionWidgets);
            }
        }
        for (const widget of selectionWidgets) validateSelection(widget, node);
        markDynamicInputsOptional(node);
        notifySelectorDynamicInputCountChanged(node);
    } finally {
        node._syncingDynamicInputs = false;
        app.graph?.setDirtyCanvas(true, true);
    }
}

export function addDynamicInput(node, inputType) {
    const inputs = getDynamicInputs(node);
    if (inputs.length >= getMaxDynamicInputs()) {
        if (app.ui && app.ui.dialog && app.ui.dialog.show) {
            app.ui.dialog.show(`Maximum of ${getMaxDynamicInputs()} inputs reached.`);
        }
        return false;
    }
    const newIndex = inputs.length > 0 ? getMaxInputIndex(inputs) + 1 : 0;
    node.addInput(
        DYNAMIC_INPUT_PREFIX + newIndex,
        inputType,
        getOptionalDynamicInputExtra(node),
    );
    return true;
}

export function removeLastDynamicInput(node, showDialog = true) {
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


const batchHandlers = {
    [BATCH_MODE_SOCKETS]: {
        add(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType) {
            performAddInputs(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType);
        },
        remove(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget) {
            performRemoveInputs(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
        },
    },
    [BATCH_MODE_WEIGHTS]: {
        add(node, count) {
            performAddWeightWidgets(node, count);
        },
        remove(node, count) {
            performRemoveWeightWidgets(node, count);
        },
    },
};

export function registerBatchHandler(mode, handler) {
    batchHandlers[mode] = handler;
}

export function showBatchInputDialog(
    node,
    selectionWidget,
    boolTrueItemIndexWidget,
    boolFalseItemIndexWidget,
    forcedInputType,
    batchMode = BATCH_MODE_SOCKETS,
) {
    const currentCount =
        batchMode === BATCH_MODE_WEIGHTS
            ? getDynamicWeightWidgets(node).length
            : getDynamicInputs(node).length;

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
            background: var(--comfy-menu-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
            min-width: 400px;
            max-width: 500px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
            color: var(--fg-color);
        }
        .batch-dialog-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 10px;
        }
        .batch-dialog-info {
            background: var(--comfy-input-bg);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 13px;
            color: var(--descrip-text);
        }
        .batch-dialog-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
        }
        .batch-dialog-tab {
            padding: 8px 15px;
            background: var(--comfy-input-bg);
            border: none;
            color: var(--fg-color);
            cursor: pointer;
            border-radius: 4px 4px 0 0;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
        }
        .batch-dialog-tab.active {
            background: var(--bg-color);
            border-bottom: 2px solid #007acc;
        }
        .batch-dialog-tab:hover {
            background: var(--bg-color);
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
            color: var(--descrip-text);
            text-transform: uppercase;
        }
        .batch-dialog-input {
            width: 100%;
            padding: 8px 10px;
            background: var(--comfy-input-bg);
            border: 1px solid var(--border-color);
            color: var(--input-text);
            border-radius: 4px;
            font-size: 13px;
            box-sizing: border-box;
        }
        .batch-dialog-input:focus {
            outline: none;
            border-color: #007acc;
            background: var(--bg-color);
        }
        .batch-dialog-presets {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 15px;
        }
        .batch-dialog-preset-btn {
            padding: 8px;
            background: var(--comfy-input-bg);
            border: 1px solid var(--border-color);
            color: var(--fg-color);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .batch-dialog-preset-btn:hover {
            background: var(--bg-color);
            border-color: #007acc;
        }
        .batch-dialog-error {
            background: color-mix(in srgb, var(--error-text) 15%, transparent);
            border: 1px solid var(--error-text);
            color: var(--error-text);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 12px;
        }
        .batch-dialog-success {
            background: color-mix(in srgb, #6bff9b 15%, transparent);
            border: 1px solid #6bff9b;
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
            border-top: 1px solid var(--border-color);
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
            background: var(--border-color);
            cursor: not-allowed;
            opacity: 0.5;
        }
        .batch-dialog-btn-cancel {
            background: var(--comfy-input-bg);
            color: var(--fg-color);
            border: 1px solid var(--border-color);
        }
        .batch-dialog-btn-cancel:hover {
            background: var(--bg-color);
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
    info.innerHTML = `Current inputs: <strong>${currentCount}</strong> / <strong>${getMaxDynamicInputs()}</strong>`;

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
        btn.innerHTML = `+${amount}<br><span style="font-size: 10px; color: var(--descrip-text);">Result: ${currentCount + amount}</span>`;
        btn.onclick = () => {
            const resultCount = currentCount + amount;
            if (resultCount > getMaxDynamicInputs()) {
                showAddError(`Cannot add ${amount} inputs. Would exceed maximum of ${getMaxDynamicInputs()}.`);
            } else {
                batchHandlers[batchMode].add(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType);
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
    customAddInput.max = String(getMaxDynamicInputs() - currentCount);
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
        btn.innerHTML = `-${amount}<br><span style="font-size: 10px; color: var(--descrip-text);">Result: ${currentCount - amount}</span>`;
        btn.onclick = () => {
            if (currentCount - amount < 1) {
                showRemoveError(`Cannot remove ${amount} inputs. Must keep at least 1 input.`);
            } else {
                batchHandlers[batchMode].remove(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
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
            if (currentCount + amount > getMaxDynamicInputs()) {
                showAddError(`Cannot add ${amount} inputs. Would exceed maximum of ${getMaxDynamicInputs()}. Max to add: ${getMaxDynamicInputs() - currentCount}`);
                return;
            }
            batchHandlers[batchMode].add(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType);
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
            batchHandlers[batchMode].remove(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
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

export function performAddInputs(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType) {
    let inputType = forcedInputType;
    if (inputType === undefined) {
        inputType = (node.outputs && node.outputs[0]) ? node.outputs[0].type : "*";
    }

    for (let i = 0; i < count; i++) {
        if (!addDynamicInput(node, inputType)) break;
    }

    validateSelection(selectionWidget, node);
    validateSelection(boolTrueItemIndexWidget, node);
    validateSelection(boolFalseItemIndexWidget, node);
    notifySelectorDynamicInputCountChanged(node);
}

export function performRemoveInputs(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget) {
    for (let i = 0; i < count; i++) {
        if (!removeLastDynamicInput(node, false)) break;
    }

    validateSelection(selectionWidget, node);
    validateSelection(boolTrueItemIndexWidget, node);
    validateSelection(boolFalseItemIndexWidget, node);
    notifySelectorDynamicInputCountChanged(node);
}

export function performAddWeightWidgets(node, count) {
    for (let i = 0; i < count; i++) {
        if (!addDynamicWeightWidget(node)) break;
    }
}

export function performRemoveWeightWidgets(node, count) {
    for (let i = 0; i < count; i++) {
        if (!removeLastDynamicWeightWidget(node, false)) break;
    }
}

export function validateSelection(widget, node) {
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

export function refreshNodeAfterWidgetStateChange(node) {
    node?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas(true, true);
    app.canvas?.draw?.(true, true);
}

export function updateWidgetAvailability(node, widget, visible, available, skipCanvasRefresh = false) {
    if (!widget)
        return;
    const enabled = available ?? visible;
    widget.hidden = !visible;
    widget.disabled = !enabled;
    // const input = node.inputs.find(i => i.name === widget.name);
    // input.hidden = !visible;
    // input.disabled = !enabled;
    if (!skipCanvasRefresh)
        refreshNodeAfterWidgetStateChange(node);
}

export function syncCustomDelimiterVisibility(node, splitModeWidget, customDelimiterWidget) {
    if (!splitModeWidget || !customDelimiterWidget)
        return;
    const mode = splitModeWidget.value;
    updateWidgetAvailability(node, customDelimiterWidget, mode === "custom" || mode === "regex");
}

export function isRandomSelectionActive(node) {
    const w = node.widgets?.find((widget) => widget.name === "random_selection");
    if (!w) return false;
    return w.value === true || w.value === "true" || w.value === 1;
}

export function bindRandomSelectionCallback(widget, node, updateFn) {
    if (!widget) return;
    const original = widget.callback;
    widget.callback = function () {
        original?.apply(this, arguments);
        updateFn(true);
        refreshNodeAfterWidgetStateChange(node);
    };
}

export function getWidgetValueStore() {
    try {
        const pinia = document.getElementById("vue-app")?.__vue_app__?.config?.globalProperties?.$pinia;
        return pinia?._s?.get("widgetValue");
    } catch {
        return null;
    }
}

export function resolveSubgraphInputTargetForPromote(hostNode, inputName) {
    if (!hostNode.isSubgraphNode?.() || !hostNode.subgraph?.inputNode?.slots)
        return;
    const inputSlot = hostNode.subgraph.inputNode.slots.find((s) => s.name === inputName);
    if (!inputSlot)
        return;
    for (const linkId of inputSlot.linkIds ?? []) {
        const link = hostNode.subgraph.getLink(linkId);
        if (!link)
            continue;
        const { inputNode, input: targetInput } = link.resolve(hostNode.subgraph);
        if (!inputNode || !targetInput)
            continue;
        if (inputNode.isSubgraphNode?.()) {
            return { nodeId: inputNode.id, widgetName: targetInput.name };
        }
        const targetWidget = inputNode.getWidgetFromSlot?.(targetInput);
        if (targetWidget) {
            return { nodeId: inputNode.id, widgetName: targetWidget.name };
        }
    }
}

export function resolveConcretePromotedChoiceWidget(hostNode, nodeId, widgetName) {
    let currentHost = hostNode;
    let currentNodeId = nodeId;
    let currentWidgetName = widgetName;
    for (let depth = 0; depth < 100; depth++) {
        const sourceNode = currentHost.subgraph?.getNodeById?.(currentNodeId);
        if (!sourceNode)
            return null;
        if (sourceNode.isSubgraphNode?.()) {
            const target = resolveSubgraphInputTargetForPromote(sourceNode, currentWidgetName);
            if (!target)
                return null;
            currentHost = sourceNode;
            currentNodeId = target.nodeId;
            currentWidgetName = target.widgetName;
            continue;
        }
        return sourceNode.widgets?.find((w) => w.name === currentWidgetName) ?? null;
    }
    return null;
}

export function visitGraphNodes(graph, fn) {
    if (!graph?._nodes)
        return;
    for (const node of graph._nodes) {
        if (node.isSubgraphNode?.() && node.subgraph)
            visitGraphNodes(node.subgraph, fn);
        fn(node);
    }
}

export function syncPromotedChoiceComboHostOptions(choiceWidget) {
    const rootGraph = app.rootGraph ?? app.graph;
    const widgetValueStore = getWidgetValueStore();
    if (!rootGraph || !widgetValueStore || choiceWidget?.type !== "combo")
        return;

    visitGraphNodes(rootGraph, (hostNode) => {
        if (!hostNode.isSubgraphNode?.())
            return;
        for (const input of hostNode.inputs ?? []) {
            if (!input.widgetId)
                continue;
            const source = resolveSubgraphInputTargetForPromote(hostNode, input.name);
            if (!source)
                continue;
            const resolvedWidget = resolveConcretePromotedChoiceWidget(
                hostNode,
                source.nodeId,
                source.widgetName,
            );
            if (resolvedWidget !== choiceWidget)
                continue;

            const state = widgetValueStore.getWidget(input.widgetId);
            if (!state)
                continue;

            state.options = { ...(choiceWidget.options ?? {}) };
            const values = choiceWidget.options?.values;
            if (Array.isArray(values) && !values.includes(state.value)) {
                const nextValue = values[0] ?? "";
                state.value = nextValue;
                widgetValueStore.setValue?.(input.widgetId, nextValue);
            }
        }
    });
}

const settingsSyncHandlers = [];

export function registerSettingsSync(fn) {
    settingsSyncHandlers.push(fn);
}

app.registerExtension({
    name: "Wakaura.DynamicSelector.Runtime",
    async setup() {
        await maxDynamicInputsReady;
        window.__WakauraDynamicSelector?.onSettingsChanged?.(() => {
            requestAnimationFrame(() => {
                for (const fn of settingsSyncHandlers) fn();
            });
        });
    },
});
