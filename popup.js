document.addEventListener('DOMContentLoaded', function() {
  const ongoingMeeting = document.getElementById('ongoingMeeting');
  const meetingTitle = document.getElementById('meetingTitle');
  const meetingDuration = document.getElementById('meetingDuration');
  const myMeetingsBtn = document.getElementById('myMeetingsBtn');
  const autoCaptureToggle = document.getElementById('autoCaptureToggle');
  const settingsIcon = document.getElementById('settingsIcon');
  
  let meetingStartTime = null;
  let durationInterval = null;

  // Initialize auto capture toggle state
  chrome.storage.sync.get(['autoCaptureEnabled'], function(result) {
    if (result.autoCaptureEnabled !== false) { // Default to true
      autoCaptureToggle.classList.remove('off');
    } else {
      autoCaptureToggle.classList.add('off');
    }
  });

  // Check if we're on a Google Meet page
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTab = tabs[0];
    
    if (currentTab.url && currentTab.url.includes('meet.google.com')) {
      // We're on Google Meet - show ongoing meeting
      ongoingMeeting.classList.remove('hidden');
      ongoingMeeting.style.display = 'flex';
      
      // Try to get meeting info from content script
      chrome.tabs.sendMessage(currentTab.id, { type: 'getMeetingInfo' }, function(response) {
        if (chrome.runtime.lastError) {
          // Content script not loaded, show default
          meetingTitle.textContent = 'Meet - Active Meeting';
        } else if (response) {
          if (response.title) {
            meetingTitle.textContent = response.title;
          }
          if (response.startTime) {
            meetingStartTime = response.startTime;
            updateDuration();
          }
        }
      });
      
      // Start duration counter
      if (!meetingStartTime) {
        meetingStartTime = Date.now();
      }
      updateDuration();
      durationInterval = setInterval(updateDuration, 1000);
      
    } else {
      // Not on Google Meet - hide ongoing meeting
      ongoingMeeting.classList.add('hidden');
      ongoingMeeting.style.display = 'none';
    }
  });

  // Update meeting duration
  function updateDuration() {
    if (meetingStartTime) {
      const elapsed = Math.floor((Date.now() - meetingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      meetingDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  // My meetings button click
  myMeetingsBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      
      if (currentTab.url && currentTab.url.includes('meet.google.com')) {
        // Toggle the assistant sidebar
        chrome.tabs.sendMessage(currentTab.id, { type: 'toggleSidebar' });
      } else {
        // Open new Google Meet tab
        chrome.tabs.create({ url: 'https://meet.google.com' });
      }
      
      window.close();
    });
  });

  // Auto capture toggle
  autoCaptureToggle.addEventListener('click', function() {
    const isCurrentlyOff = autoCaptureToggle.classList.contains('off');
    
    if (isCurrentlyOff) {
      autoCaptureToggle.classList.remove('off');
      chrome.storage.sync.set({ autoCaptureEnabled: true });
    } else {
      autoCaptureToggle.classList.add('off');
      chrome.storage.sync.set({ autoCaptureEnabled: false });
    }

    // Send message to content script if on Google Meet
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      if (currentTab.url && currentTab.url.includes('meet.google.com')) {
        chrome.tabs.sendMessage(currentTab.id, { 
          type: 'autoCaptureToggle',
          enabled: !isCurrentlyOff
        });
      }
    });
  });

  // Settings icon click - could open a settings page
  settingsIcon.addEventListener('click', function() {
    // For now, just open the extension options page if it exists
    // or show an alert
    alert('Settings functionality coming soon!');
  });

  // Clean up interval when popup closes
  window.addEventListener('beforeunload', function() {
    if (durationInterval) {
      clearInterval(durationInterval);
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'updateMeetingInfo') {
    const meetingTitle = document.getElementById('meetingTitle');
    
    if (meetingTitle && message.title) {
      meetingTitle.textContent = message.title;
    }
  }
});
