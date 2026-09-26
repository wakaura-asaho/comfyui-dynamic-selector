import { app } from "/scripts/app.js";
import { api } from "../../scripts/api.js";
import { ComfyWidgets } from "/scripts/widgets.js";

const MAX_DYNAMIC_INPUTS = 99;
const DYNAMIC_INPUT_PREFIX = "input_";
const OPTIONAL_INPUT_SHAPE = 7; // LiteGraph RenderShape.HollowCircle
const BATCH_MODE_SOCKETS = "sockets";
const BATCH_MODE_WEIGHTS = "weights";
const MAX_DYNAMIC_INPUTS_SETTINGS_API = "/api/wakaura/dynamic-selector/settings";

let _maxDynamicInputs = MAX_DYNAMIC_INPUTS;

function getMaxDynamicInputs() {
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

function getDynamicInputs(node) {
    return (node.inputs || []).filter(i => i.name && i.name.startsWith(DYNAMIC_INPUT_PREFIX));
}

function getOptionalDynamicInputExtra(node) {
    const ref = node.inputs?.find((i) => i.name === `${DYNAMIC_INPUT_PREFIX}0`);
    const shape = ref?.shape ?? OPTIONAL_INPUT_SHAPE;
    return { shape };
}

function markDynamicInputsOptional(node) {
    const { shape } = getOptionalDynamicInputExtra(node);
    for (const inp of getDynamicInputs(node)) {
        inp.shape = shape;
    }
}

function getDynamicWeightWidgets(node) {
    return (node.widgets || []).filter(
        (w) => w.name && w.name.startsWith(DYNAMIC_INPUT_PREFIX),
    );
}

function getLastDynamicWeightWidget(widgets) {
    if (!widgets || widgets.length === 0) return null;
    return widgets.reduce((a, b) => {
        const numA = parseInt(a.name.match(/\d+$/)?.[0] || "0", 10);
        const numB = parseInt(b.name.match(/\d+$/)?.[0] || "0", 10);
        return numA > numB ? a : b;
    });
}

function getMaxWeightWidgetIndex(widgets) {
    if (!widgets || widgets.length === 0) return 0;
    return parseInt(
        getLastDynamicWeightWidget(widgets).name.match(/\d+$/)?.[0] || "0",
        10,
    );
}

function weightWidgetIntSpec(defaultValue = 1) {
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

function addDynamicWeightWidget(node, defaultValue = 1) {
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

function removeLastDynamicWeightWidget(node, showDialog = true) {
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

function getDynamicInputNumber(input) {
    return parseInt(input.name.match(/\d+$/)?.[0] || "0", 10);
}

function isDynamicInputConnected(node, input) {
    return input.link != null && node.graph?.links?.[input.link];
}

function isDynamicSocketGrowthEnabled() {
    return window.__WakauraDynamicSelector?.isDynamicSocketGrowthEnabled?.() === true;
}

function isAutoCollapseEmptyInputsEnabled() {
    return window.__WakauraDynamicSelector?.isAutoCollapseEmptyInputsEnabled?.() !== false;
}

function isWeightedRandomizerSyncEnabled() {
    return window.__WakauraDynamicSelector?.isWeightedRandomizerSyncEnabled?.() === true;
}

const WEIGHTED_RANDOMIZER_OUTPUT_NAME = "weighted_randomizer";
const SELECTOR_WEIGHTED_INPUT_NAME = "weighted_randomizer";
const SYNCABLE_SELECTOR_TYPES = new Set(["DynamicTypeSelector", "DynamicGroupSelector"]);

function getLinkedSelectorsForRandomizer(randomizerNode) {
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

function getWeightedRandomizerSyncSnapshot(randomizerNode) {
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

function weightedRandomizerSyncStateKey(snapshot) {
    return `${snapshot.selectorIds.join(",")}|${snapshot.maxInputCount ?? ""}`;
}

function getWeightedRandomizersLinkedToSelector(selectorNode) {
    const graph = selectorNode.graph;
    const input = selectorNode.inputs?.find((i) => i.name === SELECTOR_WEIGHTED_INPUT_NAME);
    if (!input?.link || !graph?.links) return [];
    const link = graph.links[input.link];
    if (!link) return [];
    const origin = graph.getNodeById(link.origin_id);
    if (!origin || (origin.comfyClass || origin.type) !== "WeightedRandomizer") return [];
    return [origin];
}

function setWeightWidgetCount(node, targetCount) {
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

function maybeSyncWeightedRandomizerToSelector(randomizerNode) {
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

function notifySelectorDynamicInputCountChanged(selectorNode) {
    const nodeType = selectorNode.comfyClass || selectorNode.type;
    if (!SYNCABLE_SELECTOR_TYPES.has(nodeType)) return;
    for (const wr of getWeightedRandomizersLinkedToSelector(selectorNode)) {
        maybeSyncWeightedRandomizerToSelector(wr);
    }
}

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

function syncAllDynamicGroupNodes() {
    const nodes = app.graph?._nodes;
    if (!nodes) return;
    for (const node of nodes) {
        if (node.comfyClass !== "DynamicGroup") continue;
        syncDynamicSocketGrowth(node, []);
    }
}

function getDynamicInputType(node) {
    const connected = getConnectedDynamicInputs(node)[0];
    if (connected) return connected.type;
    if (node.outputs?.[0]) return node.outputs[0].type;
    return "*";
}

function hasGapBetweenConnectedDynamicInputs(node) {
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

function countTrailingEmptyDynamicInputs(node) {
    const inputs = getDynamicInputs(node).sort((a, b) => getDynamicInputNumber(a) - getDynamicInputNumber(b));
    let count = 0;
    for (let i = inputs.length - 1; i >= 0; i--) {
        if (isDynamicInputConnected(node, inputs[i])) break;
        count++;
    }
    return count;
}

function remapIndexAfterCompact(oldIndex, oldIndicesInOrder) {
    const newIndex = oldIndicesInOrder.indexOf(oldIndex);
    return newIndex >= 0 ? newIndex : oldIndex;
}

function applyIndexRemapToWidgets(node, oldIndicesInOrder, widgets) {
    for (const widget of widgets) {
        if (!widget) continue;
        const remapped = remapIndexAfterCompact(widget.value ?? 0, oldIndicesInOrder);
        if (widget.value !== remapped) widget.value = remapped;
    }
    for (const widget of widgets) validateSelection(widget, node);
}

function removeAllDynamicInputs(node) {
    const inputs = getDynamicInputs(node).sort((a, b) => getDynamicInputNumber(b) - getDynamicInputNumber(a));
    for (const inp of inputs) {
        const slot = node.inputs.indexOf(inp);
        if (slot < 0) continue;
        if (isDynamicInputConnected(node, inp)) node.disconnectInput(slot);
        node.removeInput(slot);
    }
}

function restructureDynamicInputs(node, inputType, connectionEntries, trailingEmptyCount) {
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

function syncDynamicSocketGrowth(node, selectionWidgets, forcedInputType) {
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

function addDynamicInput(node, inputType) {
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

function showBatchInputDialog(
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
                if (batchMode === BATCH_MODE_WEIGHTS) {
                    performAddWeightWidgets(node, amount);
                } else {
                    performAddInputs(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType);
                }
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
                if (batchMode === BATCH_MODE_WEIGHTS) {
                    performRemoveWeightWidgets(node, amount);
                } else {
                    performRemoveInputs(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
                }
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
            if (batchMode === BATCH_MODE_WEIGHTS) {
                performAddWeightWidgets(node, amount);
            } else {
                performAddInputs(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget, forcedInputType);
            }
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
            if (batchMode === BATCH_MODE_WEIGHTS) {
                performRemoveWeightWidgets(node, amount);
            } else {
                performRemoveInputs(node, amount, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget);
            }
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
        if (!addDynamicInput(node, inputType)) break;
    }

    validateSelection(selectionWidget, node);
    validateSelection(boolTrueItemIndexWidget, node);
    validateSelection(boolFalseItemIndexWidget, node);
    notifySelectorDynamicInputCountChanged(node);
}

function performRemoveInputs(node, count, selectionWidget, boolTrueItemIndexWidget, boolFalseItemIndexWidget) {
    for (let i = 0; i < count; i++) {
        if (!removeLastDynamicInput(node, false)) break;
    }

    validateSelection(selectionWidget, node);
    validateSelection(boolTrueItemIndexWidget, node);
    validateSelection(boolFalseItemIndexWidget, node);
    notifySelectorDynamicInputCountChanged(node);
}

function performAddWeightWidgets(node, count) {
    for (let i = 0; i < count; i++) {
        if (!addDynamicWeightWidget(node)) break;
    }
}

function performRemoveWeightWidgets(node, count) {
    for (let i = 0; i < count; i++) {
        if (!removeLastDynamicWeightWidget(node, false)) break;
    }
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
    async setup() {
        await maxDynamicInputsReady;
        window.__WakauraDynamicSelector?.onSettingsChanged?.(() => {
            requestAnimationFrame(() => {
                syncAllDynamicTypeSelectorNodes();
                syncAllDynamicGroupSelectorNodes();
                syncAllDynamicGroupNodes();
                syncAllWeightedRandomizerWeightCounts();
            });
        });
    },
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
