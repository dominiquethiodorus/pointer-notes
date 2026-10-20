// Injects the page-side scripts on demand (activeTab), so no broad host permissions are needed.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:|^file:/.test(tab.url || '')) return;
  try {
    // MAIN world: can read React/Vue internals that the isolated world cannot see.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['main.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) {
    console.warn('Pointer Notes: cannot inject on this page', e);
  }
});
