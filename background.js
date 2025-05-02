"use strict";

// ======= Globals & Constants =======

let timerRunning = false;           // 3 s lockout flag
let currentWorkspace = 0;           // 0 or 1
const STORAGE_KEY = "workspaceData";
const MODE_KEY    = "currentMode";

// Icons for each workspace
const workspaceIcons = [
    {
        "128": "icons/isekai.png"
    },
{
    "128": "icons/genjitsu.png"
}
];

// ======= Helper: Save & Retrieve =======

async function saveWorkspaceTabs(index, tabsData) {
    let stored = await browser.storage.local.get(STORAGE_KEY);
    let data = stored[STORAGE_KEY] || {};
    data[index] = tabsData;
    await browser.storage.local.set({ [STORAGE_KEY]: data });
    console.log(`Saved ${tabsData.length} tabs for workspace ${index}`);
}

async function getWorkspaceTabs(index) {
    let stored = await browser.storage.local.get(STORAGE_KEY);
    let data = stored[STORAGE_KEY] || {};
    let tabs = data[index] || [];
    console.log(`Loaded ${tabs.length} saved tabs for workspace ${index}`);
    return tabs;
}

// ======= Autosave Current Workspace =======

async function autosaveWorkspace() {
    if (timerRunning) return;
    console.log(`Autosave: workspace ${currentWorkspace}`);

    let allTabs = await browser.tabs.query({ currentWindow: true });
    let toSave = [];

    for (let t of allTabs) {
        // Use pendingUrl if load in progress, otherwise tab.url
        let url = t.pendingUrl || t.url || "";
        // Skip pinned tabs; include empty tabs (about:blank)
        if (t.pinned) continue;
        // Only skip non-blank about: pages
        if (url.startsWith("about:") && url !== "about:blank") continue;

        toSave.push({
            url,
            pinned: t.pinned,
            cookieStoreId: t.cookieStoreId
        });
    }

    await saveWorkspaceTabs(currentWorkspace, toSave);
}

// ======= Core: Toggle Workspaces =======

async function toggleWorkspace() {
    if (timerRunning) {
        console.log("Toggle blocked by lockout");
        return;
    }
    // Calculate dynamic timeout based on number of tabs in both workspaces
    let allTabs = await browser.tabs.query({ currentWindow: true });
    let currentTabs = allTabs.filter(t => !t.pinned && !(t.url.startsWith("about:") && t.url !== "about:blank"));
    let savedTabs = await getWorkspaceTabs(1 - currentWorkspace);
    let totalTabs = currentTabs.length + savedTabs.length;

    // Set timeout dynamically based on the total number of tabs
    let lockoutTime = totalTabs * 0.33 + 1;  // Timeout in seconds
    timerRunning = true;
    setTimeout(() => timerRunning = false, lockoutTime * 1000);  // Convert to milliseconds

    try {
        console.log(`Toggling: current=${currentWorkspace}`);
        let next = 1 - currentWorkspace;

        // 1) Query tabs & build current workspace data
        let tabsToSave = [];
        let idsToClose  = [];

        for (let t of allTabs) {
            let url = t.pendingUrl || t.url || "";
            if (t.pinned) {
                continue;
            }
            if (url.startsWith("about:") && url !== "about:blank") {
                continue;
            }
            // Save it
            tabsToSave.push({
                url,
                pinned: t.pinned,
                cookieStoreId: t.cookieStoreId
            });
            // Mark for closing
            idsToClose.push(t.id);
        }

        // 2) Persist current workspace
        await saveWorkspaceTabs(currentWorkspace, tabsToSave);

        // 3) Open a temporary blank tab
        let temp = await browser.tabs.create({ url: "about:blank", active: false });

        // 4) Close all of the current workspace’s tabs in one go
        if (idsToClose.length) {
            await browser.tabs.remove(idsToClose);
            console.log(`Closed ${idsToClose.length} tabs`);
        }

        // 5) Restore tabs for the next workspace
        let saved = await getWorkspaceTabs(next);
        for (let info of saved) {
            let createOpts = { url: info.url };
            if (info.pinned)       createOpts.pinned      = true;
            if (info.cookieStoreId) createOpts.cookieStoreId = info.cookieStoreId;
            await browser.tabs.create(createOpts);
        }
        console.log(`Opened ${saved.length} tabs for workspace ${next}`);

        // 6) Remove the temporary tab
        await browser.tabs.remove(temp.id);

        // 7) Update icon & persist mode
        await browser.browserAction.setIcon({ path: workspaceIcons[next] });
        currentWorkspace = next;
        await browser.storage.local.set({ [MODE_KEY]: currentWorkspace });
        console.log(`Switched to workspace ${next}`);
    }
    catch (e) {
        console.error("Error in togggggggggggggggggggleWorkspace:");
    }
}

// ======= Initialization & Listeners =======

// On install: initialize workspace 0
browser.runtime.onInstalled.addListener(async () => {
    currentWorkspace = 0;
    await browser.browserAction.setIcon({ path: workspaceIcons[0] });
    await browser.storage.local.set({ [MODE_KEY]: 0 });
    console.log("Installed – workspace set to 0");
});

// On startup: restore last-used workspace
browser.runtime.onStartup.addListener(async () => {
    let stored = await browser.storage.local.get(MODE_KEY);
    currentWorkspace = stored[MODE_KEY] || 0;
    console.log(`Startup – restoring workspace ${currentWorkspace}`);

    let saved = await getWorkspaceTabs(currentWorkspace);
    for (let info of saved) {
        if (!info.url) continue;
        if (info.url.startsWith("about:") && info.url !== "about:blank") continue;
        let opts = { url: info.url };
        if (info.pinned)       opts.pinned      = true;
        if (info.cookieStoreId) opts.cookieStoreId = info.cookieStoreId;
        await browser.tabs.create(opts);
    }
    await browser.browserAction.setIcon({ path: workspaceIcons[currentWorkspace] });
});

// Toolbar button click → toggle
browser.browserAction.onClicked.addListener(toggleWorkspace);

// Every 5 minutes, autosave (and persist mode)
setInterval(() => {
    autosaveWorkspace().catch(console.error);
    browser.storage.local.set({ [MODE_KEY]: currentWorkspace })
    .catch(console.error);
}, 300_000);
