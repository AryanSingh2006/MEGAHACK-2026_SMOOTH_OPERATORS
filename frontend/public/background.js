// Background service worker for the Chrome Extension
// Handles message passing and persistent storage for clicked image URLs

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IMAGE_CLICKED') {
    // Store the clicked image URL so the popup can retrieve it when reopened
    chrome.storage.local.set({
      pendingImage: {
        url: message.url,
        timestamp: Date.now()
      }
    }, () => {
      console.log('[Background] Stored pending image URL:', message.url);
    });
  }

  if (message.type === 'IMAGE_PICK_CANCELLED') {
    // Clear any pending state
    chrome.storage.local.remove('pendingImage');
  }

  if (message.type === 'CLEAR_PENDING_IMAGE') {
    // Popup consumed the image, clear storage
    chrome.storage.local.remove('pendingImage');
  }
});
