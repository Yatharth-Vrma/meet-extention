chrome.runtime.onInstalled.addListener(() => {
  console.log('Agent Assist extension installed');
});

// Handle tab audio capture requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'captureTabAudio') {
    chrome.tabCapture.capture(
      {
        audio: true,
        video: false
      },
      (stream) => {
        if (chrome.runtime.lastError) {
          console.error('Tab capture error:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, streamId: stream.id });
        }
      }
    );
    return true; // Keep the message channel open for async response
  }
  
  if (message.type === 'getTabInfo') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({
          url: tabs[0].url,
          title: tabs[0].title,
          id: tabs[0].id
        });
      }
    });
    return true;
  }
});

// Monitor tab updates for Google Meet
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('meet.google.com')) {
    // Inject content script if not already injected
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(err => {
      // Script might already be injected, ignore error
      console.log('Content script injection result:', err);
    });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes('meet.google.com')) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggleSidebar' });
  } else {
    // Open Google Meet if not on a Meet page
    chrome.tabs.create({ url: 'https://meet.google.com' });
  }
});

// WebSocket proxy for content script (if needed)
const activeConnections = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'websocket-proxy') {
    const tabId = port.sender.tab.id;
    activeConnections.set(tabId, port);
    
    port.onDisconnect.addListener(() => {
      activeConnections.delete(tabId);
    });
    
    port.onMessage.addListener((message) => {
      // Handle WebSocket proxy messages if needed
      console.log('WebSocket proxy message:', message);
    });
  }
});

// Clean up connections when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeConnections.has(tabId)) {
    activeConnections.delete(tabId);
  }
});
