import { app } from "/scripts/app.js";

const CATEGORY = "Wakaura";
const API = "/api/wakaura/dynamic-selector/settings";

const SETTINGS = [
    ["DynamicSocketGrowth", "dynamic_socket_growth", "Dynamic socket growth"],
    ["AutoCollapseEmptyInputs", "auto_collapse_empty_inputs", "Auto-collapse empty inputs"],
];

const WEIGHTED_RANDOMIZER_SETTINGS = [
    ["SyncInputCount", "weighted_randomizer_sync_input_count", "Sync weight count with linked selector"],
];

const DEFAULTS = {
    "Wakaura.DynamicSelector.DynamicSocketGrowth": false,
    "Wakaura.DynamicSelector.AutoCollapseEmptyInputs": true,
};

const WEIGHTED_RANDOMIZER_DEFAULTS = {
    "Wakaura.WeightedRandomizer.SyncInputCount": false,
};

function settingId(suffix) {
    return `Wakaura.DynamicSelector.${suffix}`;
}

function weightedRandomizerSettingId(suffix) {
    return `Wakaura.WeightedRandomizer.${suffix}`;
}

function getVal(suffix) {
    const id = settingId(suffix);
    const v = app.ui.settings.getSettingValue(id);
    return v !== undefined ? v : DEFAULTS[id];
}

function isDynamicSocketGrowthEnabled() {
    return getVal("DynamicSocketGrowth") === true;
}

function isAutoCollapseEmptyInputsEnabled() {
    return getVal("AutoCollapseEmptyInputs") !== false;
}

function getWeightedRandomizerVal(suffix) {
    const id = weightedRandomizerSettingId(suffix);
    const v = app.ui.settings.getSettingValue(id);
    return v !== undefined ? v : WEIGHTED_RANDOMIZER_DEFAULTS[id];
}

function isWeightedRandomizerSyncEnabled() {
    return getWeightedRandomizerVal("SyncInputCount") === true;
}

let _syncingFromBackend = false;
let _pushTimer = null;
const _changeListeners = new Set();

function notifySettingsChanged() {
    for (const fn of _changeListeners) fn();
}

function onSettingsChanged(fn) {
    _changeListeners.add(fn);
    return () => _changeListeners.delete(fn);
}

async function pushToBackend() {
    const payload = {
        ...Object.fromEntries(SETTINGS.map(([suffix, key]) => [key, getVal(suffix)])),
        ...Object.fromEntries(
            WEIGHTED_RANDOMIZER_SETTINGS.map(([suffix, key]) => [
                key,
                getWeightedRandomizerVal(suffix),
            ]),
        ),
    };
    try {
        const res = await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            console.error(`[Wakaura DynamicSelector] Settings save failed (HTTP ${res.status})`);
        }
    } catch (err) {
        console.error("[Wakaura DynamicSelector] Error pushing settings:", err);
    }
}

function schedulePushToBackend() {
    if (_syncingFromBackend) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
        _pushTimer = null;
        pushToBackend();
    }, 100);
}

function getSettingParams(id) {
    return app.ui?.settings?.settingsParamLookup?.[id];
}

function syncAutoCollapseControlDisabled() {
    const collapseId = settingId("AutoCollapseEmptyInputs");
    const param = getSettingParams(collapseId);
    if (!param) return;
    const disabled = !isDynamicSocketGrowthEnabled();
    param.attrs = { ...(param.attrs || {}), disabled };
}

function onSettingChange(suffix, _newVal, oldVal) {
    if (oldVal === undefined) return;
    if (suffix === "DynamicSocketGrowth") syncAutoCollapseControlDisabled();
    schedulePushToBackend();
    notifySettingsChanged();
}

function hasStoredUiSettings() {
    return (
        SETTINGS.some(([suffix]) => app.ui.settings.getSettingValue(settingId(suffix)) !== undefined)
        || WEIGHTED_RANDOMIZER_SETTINGS.some(
            ([suffix]) => app.ui.settings.getSettingValue(weightedRandomizerSettingId(suffix)) !== undefined,
        )
    );
}

async function loadFromBackend() {
    _syncingFromBackend = true;
    try {
        const res = await fetch(API);
        if (!res.ok) return;
        const data = await res.json();
        const s = app.ui.settings;
        for (const [suffix, key] of SETTINGS) {
            if (key in data) s.setSettingValue(settingId(suffix), data[key]);
        }
        for (const [suffix, key] of WEIGHTED_RANDOMIZER_SETTINGS) {
            if (key in data) s.setSettingValue(weightedRandomizerSettingId(suffix), data[key]);
        }
    } catch (err) {
        console.error("[Wakaura DynamicSelector] Error loading settings:", err);
    } finally {
        _syncingFromBackend = false;
    }
}

function onWeightedRandomizerSettingChange(_newVal, oldVal) {
    if (oldVal === undefined) return;
    schedulePushToBackend();
    notifySettingsChanged();
}

window.__WakauraDynamicSelector = {
    isDynamicSocketGrowthEnabled,
    isAutoCollapseEmptyInputsEnabled,
    isWeightedRandomizerSyncEnabled,
    onSettingsChanged,
};

app.registerExtension({
    name: "Wakaura.DynamicSelector.Settings",
    settings: SETTINGS.map(([suffix, _key, label]) => ({
        id: settingId(suffix),
        name: label,
        type: "boolean",
        default: DEFAULTS[settingId(suffix)],
        category: [CATEGORY, "Dynamic Selector", label],
        tooltip: suffix === "DynamicSocketGrowth"
            ? "Auto-grow dynamic inputs on Dynamic Type/Group/Group Selector nodes.\nDisables manual add/remove on those nodes."
            : "When dynamic socket growth is on, remove empty gaps and renumber inputs after disconnect.",
        attrs: suffix === "AutoCollapseEmptyInputs"
            ? { disabled: !DEFAULTS[settingId("DynamicSocketGrowth")] }
            : undefined,
        onChange: (newVal, oldVal) => onSettingChange(suffix, newVal, oldVal),
    })),
    async setup() {
        if (hasStoredUiSettings()) {
            await pushToBackend();
        } else {
            await loadFromBackend();
        }
        syncAutoCollapseControlDisabled();
    },
});

app.registerExtension({
    name: "Wakaura.WeightedRandomizer.Settings",
    settings: WEIGHTED_RANDOMIZER_SETTINGS.map(([suffix, _key, label]) => ({
        id: weightedRandomizerSettingId(suffix),
        name: label,
        type: "boolean",
        default: WEIGHTED_RANDOMIZER_DEFAULTS[weightedRandomizerSettingId(suffix)],
        category: [CATEGORY, "Weighted Randomizer", label],
        tooltip:
            "When enabled, Weighted Randomizer adjusts its weight widgets to match the highest input count among all linked Dynamic Type Selectors.\nSync runs only when links change or that max input count changes.\nManual add/remove weight menus are disabled.",
        onChange: (newVal, oldVal) => onWeightedRandomizerSettingChange(newVal, oldVal),
    })),
});
