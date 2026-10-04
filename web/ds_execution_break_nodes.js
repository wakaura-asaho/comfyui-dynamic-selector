import { app } from "/scripts/app.js";
import { $el } from "/scripts/ui.js";

export const EXTRA_NODE_TYPES_SETTING_KEY = "iterator_execution_break_extra_node_types";

export const BUILTIN_EXECUTION_BREAK_NODE_TYPES = new Set([
    "KSampler",
    "KSamplerAdvanced",
    "SamplerCustom",
    "SamplerCustomAdvanced",
    "ImageUpscaleWithModel",
    "VAEDecode",
    "VAEEncode",
    "VAEDecodeTiled",
    "VAEEncodeTiled",
    "VAEEncodeForInpaint",
    "LatentUpscale",
    "LatentUpscaleBy",
    "SeedVR2VideoUpscaler",
]);

const PICKER_ROOT_CLASS = "wakaura-ds-exec-break-picker";
const UNDERLYING_OVERLAY_SELECTOR =
    '[data-testid="dialog-overlay"], .p-dialog-mask';
let _builtinTypes = null;
let _pickerInstance = null;
let _blockedOverlays = [];

function getOpenSettingsDialogHost() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return (
        dialogs.find((el) => el.getAttribute("data-state") === "open")
        ?? dialogs.find((el) => el.offsetParent !== null || getComputedStyle(el).display !== "none")
        ?? dialogs.at(-1)
        ?? null
    );
}

function restoreUnderlyingOverlayPointerEvents() {
    for (const { el, pointerEvents } of _blockedOverlays) {
        el.style.pointerEvents = pointerEvents;
    }
    _blockedOverlays = [];
}

function blockUnderlyingOverlayPointerEvents() {
    restoreUnderlyingOverlayPointerEvents();
    for (const el of document.querySelectorAll(UNDERLYING_OVERLAY_SELECTOR)) {
        if (el.closest(`.${PICKER_ROOT_CLASS}`)) continue;
        _blockedOverlays.push({
            el,
            pointerEvents: el.style.pointerEvents,
        });
        el.style.pointerEvents = "none";
    }
}

function removeStalePickerModals() {
    restoreUnderlyingOverlayPointerEvents();
    for (const el of document.querySelectorAll(`.${PICKER_ROOT_CLASS}`)) {
        el.remove();
    }
    _pickerInstance = null;
}

function applyModalStackZIndex(modalEl) {
    let maxZ = 5500;
    for (const node of document.querySelectorAll(
        '[data-testid="dialog-overlay"], [role="dialog"], .p-dialog-mask',
    )) {
        const z = Number.parseInt(getComputedStyle(node).zIndex, 10);
        if (!Number.isNaN(z)) maxZ = Math.max(maxZ, z);
    }
    modalEl.style.zIndex = String(maxZ + 20);
}

function stopEvent(e) {
    e.stopPropagation();
}

function injectPickerStyles() {
    if (document.getElementById("wakaura-ds-exec-break-styles")) return;
    const style = document.createElement("style");
    style.id = "wakaura-ds-exec-break-styles";
    style.textContent = `
.${PICKER_ROOT_CLASS} {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.45);
    pointer-events: auto;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-card {
    display: flex;
    flex-direction: column;
    width: min(760px, 100%);
    max-height: min(80vh, 720px);
    border-radius: 12px;
    border: 1px solid var(--border-color, #3a3a3a);
    background: var(--bg-color, var(--comfy-menu-bg, #1e1e1e));
    color: var(--fg-color, var(--input-text, #e8e8e8));
    box-shadow: none;
    overflow: hidden;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color, #3a3a3a);
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-title {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-icon-btn {
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    background: transparent;
    color: var(--descrip-text, #aaa);
    font-size: 18px;
    line-height: 1;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-icon-btn:hover {
    background: var(--content-hover-bg, #333);
    color: var(--fg-color, #fff);
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-body {
    padding: 12px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    flex: 1;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    flex: 1;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-search {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #444);
    background: var(--comfy-input-bg, #222);
    color: var(--input-text, #eee);
    font-size: 14px;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-columns {
    display: flex;
    gap: 12px;
    min-height: 280px;
    flex: 1;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--border-color, #444);
    border-radius: 8px;
    background: var(--comfy-input-bg, #1a1a1a);
    overflow: hidden;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-panel-title {
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color, #444);
    color: var(--descrip-text, #aaa);
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-list {
    overflow-y: auto;
    flex: 1;
    padding: 4px;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-item {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    border-radius: 6px;
    padding: 8px 10px;
    margin: 2px 0;
    cursor: pointer;
    background: transparent;
    color: var(--input-text, #eee);
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-item:hover,
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-item:focus-visible {
    background: var(--content-hover-bg, #333);
    outline: none;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-item-title {
    font-size: 14px;
    font-weight: 600;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-item-meta {
    font-size: 11px;
    color: var(--descrip-text, #999);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-extra-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-extra-row:nth-child(odd) {
    background: var(--tr-odd-bg-color, rgba(255,255,255,0.03));
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-extra-label {
    flex: 1;
    min-width: 0;
    font-size: 13px;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-remove {
    flex-shrink: 0;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #555);
    background: var(--comfy-input-bg, #2a2a2a);
    color: var(--input-text, #eee);
    cursor: pointer;
    font-size: 12px;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-empty {
    padding: 12px;
    font-size: 12px;
    color: var(--descrip-text, #888);
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-btn {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #555);
    background: var(--comfy-input-bg, #2a2a2a);
    color: var(--input-text, #eee);
    font-size: 13px;
    cursor: pointer;
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-btn-primary {
    background: var(--content-hover-bg, #3d3d3d);
    border-color: var(--border-color, #666);
}
.${PICKER_ROOT_CLASS} .wakaura-ds-eb-summary {
    font-size: 12px;
    color: var(--descrip-text, #aaa);
}
`;
    document.head.appendChild(style);
}

export function parseExtraNodeTypes(raw) {
    if (Array.isArray(raw)) {
        return raw.map((x) => String(x).trim()).filter(Boolean);
    }
    if (typeof raw !== "string" || !raw.trim()) return [];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function serializeExtraNodeTypes(types) {
    return [...types].sort((a, b) => a.localeCompare(b)).join(",");
}

export function getBuiltinExecutionBreakTypes() {
    return _builtinTypes ?? BUILTIN_EXECUTION_BREAK_NODE_TYPES;
}

export async function loadBuiltinExecutionBreakTypesFromApi() {
    try {
        const res = await fetch("/api/wakaura/dynamic-selector/execution-break-defaults");
        if (!res.ok) return getBuiltinExecutionBreakTypes();
        const data = await res.json();
        if (Array.isArray(data.default_node_types)) {
            _builtinTypes = new Set(data.default_node_types);
            return _builtinTypes;
        }
    } catch (err) {
        console.warn("[Wakaura DynamicSelector] Could not load execution-break defaults:", err);
    }
    return getBuiltinExecutionBreakTypes();
}

function isBrowsableNodeType(classType, nodeClass) {
    if (!classType || !nodeClass) return false;
    if (classType.startsWith("workflow/") || classType.includes("subgraph")) return false;
    const nd = nodeClass.nodeData;
    if (nd?.experimental === true && nd?.deprecated === true) return false;
    return true;
}

export function buildNodeCatalog() {
    const catalog = [];
    const types = LiteGraph.registered_node_types ?? {};
    for (const classType of Object.keys(types)) {
        const nodeClass = types[classType];
        if (!isBrowsableNodeType(classType, nodeClass)) continue;
        const nd = nodeClass.nodeData ?? {};
        const title = nd.display_name || nodeClass.title || classType;
        const category = (nd.category || nodeClass.category || "").replace(/\//g, " / ");
        const description = nd.description || nodeClass.description || "";
        catalog.push({
            classType,
            title,
            category,
            description,
            searchText: `${classType} ${title} ${category} ${description}`.toLowerCase(),
        });
    }
    catalog.sort((a, b) => a.title.localeCompare(b.title));
    return catalog;
}

class ExecutionBreakNodePicker {
    constructor({ extraTypes, onSave }) {
        this.extraTypes = new Set(extraTypes);
        this.onSave = onSave;
        this.catalog = buildNodeCatalog();
        this.root = null;
        this._onKeyDown = null;
    }

    renderSearchList(query) {
        const q = query.trim().toLowerCase();
        const builtin = getBuiltinExecutionBreakTypes();
        const selected = new Set([...builtin, ...this.extraTypes]);
        const matches = this.catalog.filter((entry) => {
            if (selected.has(entry.classType)) return false;
            if (!q) return true;
            return entry.searchText.includes(q);
        });
        const max = q ? 80 : 40;
        const slice = matches.slice(0, max);
        if (slice.length === 0) {
            return $el("div.wakaura-ds-eb-empty", {
                textContent: q ? "No matching nodes." : "All visible nodes are already on the allowlist.",
            });
        }
        return $el(
            "div",
            slice.map((entry) =>
                $el(
                    "button",
                    {
                        type: "button",
                        className: "wakaura-ds-eb-item",
                        onclick: (e) => {
                            stopEvent(e);
                            this.addExtra(entry.classType);
                        },
                    },
                    [
                        $el("div", { className: "wakaura-ds-eb-item-title", textContent: entry.title }),
                        $el("div", {
                            className: "wakaura-ds-eb-item-meta",
                            textContent: `${entry.classType}${entry.category ? ` · ${entry.category}` : ""}`,
                            title: entry.description || entry.classType,
                        }),
                    ],
                ),
            ),
        );
    }

    renderExtraList() {
        const sorted = [...this.extraTypes].sort((a, b) => a.localeCompare(b));
        if (sorted.length === 0) {
            return $el("div.wakaura-ds-eb-empty", {
                textContent: "No extra nodes. Built-in heavy nodes still receive cooldown.",
            });
        }
        return $el(
            "div",
            sorted.map((classType) => {
                const entry = this.catalog.find((c) => c.classType === classType);
                const label = entry ? `${entry.title} (${classType})` : classType;
                return $el("div.wakaura-ds-eb-extra-row", [
                    $el("span", { className: "wakaura-ds-eb-extra-label", textContent: label, title: classType }),
                    $el("button", {
                        type: "button",
                        className: "wakaura-ds-eb-remove",
                        textContent: "Remove",
                        onclick: (e) => {
                            stopEvent(e);
                            this.removeExtra(classType);
                        },
                    }),
                ]);
            }),
        );
    }

    addExtra(classType) {
        if (getBuiltinExecutionBreakTypes().has(classType)) return;
        this.extraTypes.add(classType);
        this.refreshLists();
    }

    removeExtra(classType) {
        this.extraTypes.delete(classType);
        this.refreshLists();
    }

    refreshLists() {
        if (this._searchInput) {
            this._searchList.replaceChildren();
            this._searchList.append(this.renderSearchList(this._searchInput.value));
        }
        this._extraList.replaceChildren();
        this._extraList.append(this.renderExtraList());
        if (this._summaryEl) {
            const builtinCount = getBuiltinExecutionBreakTypes().size;
            this._summaryEl.textContent =
                `${builtinCount} built-in + ${this.extraTypes.size} extra node type(s)`;
        }
    }

    close() {
        if (this._onKeyDown) {
            document.removeEventListener("keydown", this._onKeyDown, true);
            this._onKeyDown = null;
        }
        restoreUnderlyingOverlayPointerEvents();
        this.root?.remove();
        this.root = null;
        if (_pickerInstance === this) {
            _pickerInstance = null;
        }
    }

    show() {
        injectPickerStyles();
        this._searchInput = $el("input", {
            className: "wakaura-ds-eb-search",
            type: "search",
            placeholder: "Search nodes to add…",
            autocomplete: "off",
            oninput: () => this.refreshLists(),
        });
        this._searchList = $el("div.wakaura-ds-eb-list");
        this._extraList = $el("div.wakaura-ds-eb-list");
        this._summaryEl = $el("div", { className: "wakaura-ds-eb-summary" });
        const shell = $el("div.wakaura-ds-eb-shell", [
            this._summaryEl,
            this._searchInput,
            $el("div.wakaura-ds-eb-columns", [
                $el("div.wakaura-ds-eb-panel", [
                    $el("div.wakaura-ds-eb-panel-title", { textContent: "Add node" }),
                    this._searchList,
                ]),
                $el("div.wakaura-ds-eb-panel", [
                    $el("div.wakaura-ds-eb-panel-title", { textContent: "Extra cooldown nodes" }),
                    this._extraList,
                ]),
            ]),
            $el("div.wakaura-ds-eb-footer", [
                $el("button", {
                    type: "button",
                    className: "wakaura-ds-eb-btn",
                    textContent: "Cancel",
                    onclick: (e) => {
                        stopEvent(e);
                        this.close();
                    },
                }),
                $el("button", {
                    type: "button",
                    className: "wakaura-ds-eb-btn wakaura-ds-eb-btn-primary",
                    textContent: "Save",
                    onclick: (e) => {
                        stopEvent(e);
                        this.onSave(serializeExtraNodeTypes(this.extraTypes));
                        this.close();
                    },
                }),
            ]),
        ]);
        const card = $el("div", { className: "wakaura-ds-eb-card" }, [
                $el("div.wakaura-ds-eb-header", [
                    $el("h2", { className: "wakaura-ds-eb-title", textContent: "Extra cooldown nodes" }),
                    $el("button", {
                        type: "button",
                        className: "wakaura-ds-eb-icon-btn",
                        textContent: "×",
                        "aria-label": "Close",
                        onclick: (e) => {
                            stopEvent(e);
                            this.close();
                        },
                    }),
                ]),
                $el("div.wakaura-ds-eb-body", [shell]),
            ],
        );
        this.root = $el("div", {
            className: PICKER_ROOT_CLASS,
            onpointerdown: (e) => {
                if (e.target === this.root) {
                    e.preventDefault();
                    this.close();
                }
            },
        }, [card]);
        this._onKeyDown = (e) => {
            if (e.key !== "Escape" || !this.root) return;
            e.stopPropagation();
            e.preventDefault();
            this.close();
        };
        document.addEventListener("keydown", this._onKeyDown, true);
        const host = getOpenSettingsDialogHost() ?? document.body;
        host.appendChild(this.root);
        applyModalStackZIndex(this.root);
        blockUnderlyingOverlayPointerEvents();
        this.refreshLists();
        requestAnimationFrame(() => this._searchInput?.focus());
    }
}

export function openExecutionBreakNodePicker({ getExtraRaw, setExtraRaw, onPersist }) {
    removeStalePickerModals();
    const builtin = getBuiltinExecutionBreakTypes();
    const extras = parseExtraNodeTypes(getExtraRaw()).filter((t) => !builtin.has(t));
    const picker = new ExecutionBreakNodePicker({
        extraTypes: extras,
        onSave: (serialized) => {
            setExtraRaw(serialized);
            onPersist?.();
        },
    });
    _pickerInstance = picker;
    picker.show();
}

export function installExecutionBreakExtraNodesSetting({
    settingId,
    getStoredExtra,
    setStoredExtra,
    onPersist,
}) {
    const manageId = settingId.replaceAll(".", "-");
    app.ui.settings.addSetting({
        id: settingId,
        name: "Manage extra cooldown nodes",
        defaultValue: "",
        type: () =>
            $el("tr", [
                $el("td", [
                    $el("label", {
                        for: manageId,
                        textContent: "Extra cooldown nodes",
                    }),
                ]),
                $el("td", [
                    $el("button", {
                        id: manageId,
                        textContent: "Search & add nodes…",
                        onclick: async (e) => {
                            stopEvent(e);
                            await loadBuiltinExecutionBreakTypesFromApi();
                            openExecutionBreakNodePicker({
                                getExtraRaw: getStoredExtra,
                                setExtraRaw: setStoredExtra,
                                onPersist,
                            });
                        },
                        style: { fontSize: "14px" },
                    }),
                ]),
            ]),
    });
}
