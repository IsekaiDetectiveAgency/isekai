// background.js

"use strict";

// ======= Globals & Constants =======

let timerRunning = false;
let isToggling = false;
let currentWorkspace = 0;
const STORAGE_KEY = "workspaceData";
const MODE_KEY = "currentMode";

const workspaceIcons = [
    { "128": "icons/isekai.png" },
    { "128": "icons/genjitsu.png" }
];

const COOLDOWN_ICON = { "128": "icons/warping.png" };

// ======= Helper: Save & Retrieve =======

async function saveWorkspaceTabs(index, tabsData) {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const data = stored[STORAGE_KEY] || {};
    data[index] = tabsData;
    await browser.storage.local.set({ [STORAGE_KEY]: data });
}

async function getWorkspaceTabs(index) {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const data = stored[STORAGE_KEY] || {};
    return data[index] || [];
}

// ======= Autosave Current Workspace =======

async function autosaveWorkspace() {
    if (timerRunning) return;

    const allTabs = await browser.tabs.query({ currentWindow: true });
    const toSave = allTabs.filter(t => {
        const url = t.url || t.pendingUrl || "";
        return !t.pinned && (!url.startsWith("about:") || url === "about:blank");
    }).map(t => ({
        url: t.url || t.pendingUrl || "",
        pinned: t.pinned,
        cookieStoreId: t.cookieStoreId
    }));

    await saveWorkspaceTabs(currentWorkspace, toSave);
}

// ======= Core: Toggle Workspaces =======

async function toggleWorkspace() {
    if (timerRunning || isToggling) return;

    isToggling = true;
    try {
        const allTabs = await browser.tabs.query({ currentWindow: true });
        const currentTabs = allTabs.filter(t => {
            const url = t.url || t.pendingUrl || "";
            return !t.pinned && (!url.startsWith("about:") || url === "about:blank");
        });

        const savedTabs = await getWorkspaceTabs(1 - currentWorkspace);
        const totalTabs = currentTabs.length + savedTabs.length;

        const lockoutTime = totalTabs + 1;
        timerRunning = true;
        await browser.browserAction.setIcon({ path: COOLDOWN_ICON });

        setTimeout(async () => {
            timerRunning = false;
            await browser.browserAction.setIcon({ path: workspaceIcons[currentWorkspace] });
        }, lockoutTime * 1000);

        const next = 1 - currentWorkspace;

        const tabsToSave = currentTabs.map(t => ({
            url: t.url || t.pendingUrl || "",
            pinned: t.pinned,
            cookieStoreId: t.cookieStoreId
        }));

        const idsToClose = currentTabs.map(t => t.id);
        await saveWorkspaceTabs(currentWorkspace, tabsToSave);

        const temp = await browser.tabs.create({ url: "about:blank", active: false });

        if (idsToClose.length) await browser.tabs.remove(idsToClose);

        let saved = await getWorkspaceTabs(next);
        if (saved.length === 0) {
            saved = [{ url: "about:blank" }];
            await saveWorkspaceTabs(next, saved);
        }

        const createTab = async (info) => {
            const createOpts = { url: info.url };
            if (info.pinned) createOpts.pinned = true;
            if (info.cookieStoreId) createOpts.cookieStoreId = info.cookieStoreId;
            await browser.tabs.create(createOpts);
        };

        for (const info of saved) {
            if (info.url && (!info.url.startsWith("about:") || info.url === "about:blank")) {
                await createTab(info);
            }
        }

        await browser.tabs.remove(temp.id);

        currentWorkspace = next;
        await browser.storage.local.set({ [MODE_KEY]: currentWorkspace });
    } finally {
        isToggling = false;
    }
}

// ======= Initialization & Listeners =======

browser.runtime.onInstalled.addListener(async () => {
    currentWorkspace = 0;
    await browser.browserAction.setIcon({ path: workspaceIcons[0] });
    await browser.storage.local.set({ [MODE_KEY]: 0 });
});

browser.runtime.onStartup.addListener(async () => {
    const stored = await browser.storage.local.get(MODE_KEY);
    currentWorkspace = stored[MODE_KEY] || 0;

    const saved = await getWorkspaceTabs(currentWorkspace);
    for (const info of saved) {
        if (!info.url || (info.url.startsWith("about:") && info.url !== "about:blank")) continue;
        const opts = { url: info.url };
        if (info.pinned) opts.pinned = true;
        if (info.cookieStoreId) opts.cookieStoreId = info.cookieStoreId;
        await browser.tabs.create(opts);
    }

    await browser.browserAction.setIcon({ path: workspaceIcons[currentWorkspace] });
});

browser.browserAction.onClicked.addListener(toggleWorkspace);

setInterval(async () => {
    await autosaveWorkspace();
    await browser.storage.local.set({ [MODE_KEY]: currentWorkspace });
}, 300_000);
