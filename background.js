// Keys for storage
const MODE_KEY = 'currentMode';
const SET_A_KEY = 'setA_urls';
const SET_B_KEY = 'setB_urls';

// Initialize default mode and icon
browser.storage.local.get(MODE_KEY).then(data => {
    const mode = data[MODE_KEY] || 'A';
    if (!data[MODE_KEY]) {
        browser.storage.local.set({ [MODE_KEY]: 'A' });
    }
    updateIcon(mode);
});

let isProcessing = false;

browser.browserAction.onClicked.addListener(async () => {
    if (isProcessing) return;
    isProcessing = true;

    // 1) Figure out mode & tab lists
    const { [MODE_KEY]: mode } = await browser.storage.local.get(MODE_KEY);
    const fromKey  = mode === 'A' ? SET_A_KEY : SET_B_KEY;
    const toKey    = mode === 'A' ? SET_B_KEY : SET_A_KEY;
    const nextMode = mode === 'A' ? 'B' : 'A';

    // 2) Grab your current tabs
    const tabs = await browser.tabs.query({ currentWindow: true });
    const urls = tabs.map(t => t.url);

    // 3) Flip workspaces: open a blank, close old tabs
    let blankTab;
    try { blankTab = await browser.tabs.create({ url: 'about:blank' }); } catch (_) {}
    const oldIds = tabs.map(t => t.id).filter(id => blankTab && id !== blankTab.id);
    if (oldIds.length) {
        try { await browser.tabs.remove(oldIds); } catch (_) {}
    }

    // 4) Load the “other” workspace
    const otherData = await browser.storage.local.get(toKey);
    let toUrls = (otherData[toKey] && otherData[toKey].length)
    ? otherData[toKey]
    : urls;
    for (const u of toUrls) {
        try { await browser.tabs.create({ url: u }); } catch (_) {}
    }
    if (toUrls.length && blankTab) {
        try { await browser.tabs.remove(blankTab.id); } catch (_) {}
    }

    // 5) Compute dynamic delay: 330 ms × (current + new tabs), minimum 330 ms
    const totalTabs = urls.length + toUrls.length;
    const delay     = Math.max(totalTabs * 330, 330);

    // 6) After delay → save & switch mode & update icon & clear lock
    setTimeout(async () => {
        await browser.storage.local.set({ [fromKey]: urls });
        await browser.storage.local.set({ [MODE_KEY]: nextMode });
        updateIcon(nextMode);
        isProcessing = false;
    }, delay);
});

// On browser startup, load the current mode’s tabs
browser.runtime.onStartup.addListener(async () => {
    const { [MODE_KEY]: mode } = await browser.storage.local.get(MODE_KEY);
    updateIcon(mode);

    const key = mode === 'A' ? SET_A_KEY : SET_B_KEY;
    const data = await browser.storage.local.get(key);
    const urls = data[key] || [];
    if (!urls.length) return;

    // Replace existing tabs
    const tabs = await browser.tabs.query({ currentWindow: true });
    let blankTab;
    try { blankTab = await browser.tabs.create({ url: 'about:blank' }); } catch (_) {}
    const oldIds = tabs.map(t => t.id).filter(id => blankTab && id !== blankTab.id);
    if (oldIds.length) {
        try { await browser.tabs.remove(oldIds); } catch (_) {}
    }
    for (const u of urls) {
        try { await browser.tabs.create({ url: u }); } catch (_) {}
    }
    if (blankTab) {
        try { await browser.tabs.remove(blankTab.id); } catch (_) {}
    }
});

// Helper: update toolbar icon
function updateIcon(mode) {
    const path = mode === 'A'
    ? 'icons/modeA_icon.png'
    : 'icons/modeB_icon.png';
    browser.browserAction.setIcon({ path });
}
