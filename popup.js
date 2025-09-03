document.addEventListener('DOMContentLoaded', function() {
  const ongoingMeeting = document.getElementById('ongoingMeeting');
  const meetingTitle = document.getElementById('meetingTitle');
  const meetingDuration = document.getElementById('meetingDuration');
  const myMeetingsBtn = document.getElementById('myMeetingsBtn');
  const autoCaptureToggle = document.getElementById('autoCaptureToggle');
  const settingsIcon = document.getElementById('settingsIcon');
  
  // Voice recorder timer properties (sync with content script)
  let timerState = {
    isRunning: false,
    accumulatedTime: 0,
    sessionStartTime: null
  };
  let timerInterval = null;

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
      
      // Get meeting info and timer state from content script
      chrome.tabs.sendMessage(currentTab.id, { type: 'getTimerState' }, function(response) {
        if (chrome.runtime.lastError) {
          // Content script not loaded, show default
          meetingTitle.textContent = 'Meet - Active Meeting';
          meetingDuration.textContent = '00:00';
        } else if (response) {
          // Update timer state
          timerState = {
            isRunning: response.isRunning || false,
            accumulatedTime: response.accumulatedTime || 0,
            sessionStartTime: response.sessionStartTime || null
          };
          
          updateTimerDisplay();
          
          // Start sync timer if recording
          if (timerState.isRunning) {
            startSyncTimer();
          }
          
          meetingDuration.textContent = formatDuration(timerState.accumulatedTime);
        }
      });
      
    } else {
      // Not on Google Meet - hide ongoing meeting
      ongoingMeeting.classList.add('hidden');
      ongoingMeeting.style.display = 'none';
    }
  });

  // Start timer sync (for when recording)
  function startSyncTimer() {
    if (timerInterval) return;
    
    timerInterval = setInterval(() => {
      if (timerState.isRunning && timerState.sessionStartTime) {
        updateTimerDisplay();
      } else {
        // Request updated state from content script
        requestTimerUpdate();
      }
    }, 1000);
  }

  // Stop timer sync
  function stopSyncTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // Request timer update from content script
  function requestTimerUpdate() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      if (currentTab.url && currentTab.url.includes('meet.google.com')) {
        chrome.tabs.sendMessage(currentTab.id, { type: 'getTimerState' }, function(response) {
          if (!chrome.runtime.lastError && response) {
            timerState = {
              isRunning: response.isRunning || false,
              accumulatedTime: response.accumulatedTime || 0,
              sessionStartTime: response.sessionStartTime || null
            };
            
            updateTimerDisplay();
            
            if (timerState.isRunning && !timerInterval) {
              startSyncTimer();
            } else if (!timerState.isRunning && timerInterval) {
              stopSyncTimer();
            }
          }
        });
      }
    });
  }

  // Update timer display (voice recorder style)
  function updateTimerDisplay() {
    if (!meetingDuration) return;
    
    let currentTime = timerState.accumulatedTime;
    
    // Add current session time if recording
    if (timerState.isRunning && timerState.sessionStartTime) {
      const currentSessionTime = Math.floor((Date.now() - timerState.sessionStartTime) / 1000);
      currentTime += currentSessionTime;
    }
    
    meetingDuration.textContent = formatDuration(currentTime);
    console.log('[Popup][TIMER] Display updated:', formatDuration(currentTime));
  }

  // Format duration as MM:SS or HH:MM:SS (same as content script)
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }

  // Set up periodic timer sync
  function setupTimerSync() {
    // Initial sync
    requestTimerUpdate();
    
    // Periodic sync every 5 seconds
    setInterval(() => {
      requestTimerUpdate();
    }, 5000);
  }

  // Start timer sync when popup opens
  setTimeout(() => {
    setupTimerSync();
  }, 500);

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
    stopSyncTimer();
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
  
  // Listen for timer updates from content script
  if (message.type === 'timerUpdate') {
    if (message.timerState) {
      timerState = {
        isRunning: message.timerState.isRunning || false,
        accumulatedTime: message.timerState.accumulatedTime || 0,
        sessionStartTime: message.timerState.sessionStartTime || null
      };
      
      updateTimerDisplay();
      
      // Start or stop sync timer based on recording state
      if (timerState.isRunning && !timerInterval) {
        startSyncTimer();
      } else if (!timerState.isRunning && timerInterval) {
        stopSyncTimer();
      }
    }
  }
});
