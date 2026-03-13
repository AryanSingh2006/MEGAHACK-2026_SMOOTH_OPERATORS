// Background service worker for the Chrome Extension
// Handles message passing between content script and popup

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IMAGE_CLICKED' || message.type === 'IMAGE_PICK_CANCELLED') {
    // Forward image URL to the popup
    chrome.runtime.sendMessage(message);
  }
});
