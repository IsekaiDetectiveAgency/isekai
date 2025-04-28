// Keys for storage
const MODE_KEY = 'currentMode';
const SET_A_KEY = 'setA_urls';
const SET_B_KEY = 'setB_urls';

// Initialize default mode
browser.storage.local.get(MODE_KEY).then(data => {
    if (!data[MODE_KEY]) {
        browser.storage.local.set({ [MODE_KEY]: 'A' });
    }
    updateIcon(data[MODE_KEY]);
});

let isProcessing = false;

browser.browserAction.onClicked.addListener(async () => {
    if (isProcessing) {
        return;
    }

    isProcessing = true;

    try {
        const { [MODE_KEY]: mode } = await browser.storage.local.get(MODE_KEY);

        const fromSetKey = mode === 'A' ? SET_A_KEY : SET_B_KEY;
        const toSetKey = mode === 'A' ? SET_B_KEY : SET_A_KEY;
        const nextMode = mode === 'A' ? 'B' : 'A';

        const tabs = await browser.tabs.query({ currentWindow: true });
        const urls = tabs.map(t => t.url);

        await browser.storage.local.set({ [fromSetKey]: urls });

        let newTab;
        try {
            newTab = await browser.tabs.create({ url: "about:blank" });
        } catch (err) {
            // Fail silently
        }

        const oldTabIds = tabs.map(t => t.id).filter(id => newTab && id !== newTab.id);

        if (oldTabIds.length) {
            try {
                await browser.tabs.remove(oldTabIds);
            } catch (err) {
                // Fail silently
            }
        }

        const otherData = await browser.storage.local.get(toSetKey);
        const toUrls = otherData[toSetKey] || [];

        if (!toUrls.length) {
            toUrls.push(...urls);
        }

        for (const url of toUrls) {
            try {
                await browser.tabs.create({ url });
            } catch (err) {
                // Fail silently
            }
        }

        if (toUrls.length > 0 && newTab) {
            try {
                await browser.tabs.remove(newTab.id);
            } catch (err) {
                // Fail silently
            }
        }

        await browser.storage.local.set({ [MODE_KEY]: nextMode });
        updateIcon(nextMode);
    } catch (err) {
        // Fail silently
    }

    setTimeout(() => {
        isProcessing = false;
    }, 3000);
});

// Function to update the icon based on current mode
function updateIcon(mode) {
    const iconPath = mode === 'A' ? 'icons/modeA_icon.png' : 'icons/modeB_icon.png';
    browser.browserAction.setIcon({ path: iconPath });
}
