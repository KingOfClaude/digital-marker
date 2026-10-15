const MANAGER_URL = chrome.runtime.getURL('manager.html');

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'hlr-highlight',
      title: 'Highlight selection',
      contexts: ['selection']
    });
  });
});

function flagFailure() {
  chrome.action.setBadgeBackgroundColor({ color: '#b3392b' });
  chrome.action.setBadgeText({ text: '!' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}

async function highlightIn(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'highlight' });
  } catch (e) {
    // Tab was open before the extension was installed or reloaded: inject the script, then retry.
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, { type: 'highlight' });
    } catch (e2) {
      flagFailure(); // restricted page such as chrome:// or the Web Store
    }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'hlr-highlight' && tab && tab.id) highlightIn(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'highlight-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) highlightIn(tab.id);
});

// Toolbar icon opens the manager, reusing an open manager tab if there is one.
chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url && t.url.startsWith(MANAGER_URL));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: MANAGER_URL });
  }
});
