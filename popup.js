document.addEventListener('DOMContentLoaded', function() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const meetingInfo = document.getElementById('meetingInfo');
  const participantCount = document.getElementById('participantCount');
  const duration = document.getElementById('duration');
  const openMeetBtn = document.getElementById('openMeet');
  const toggleAssistBtn = document.getElementById('toggleAssist');
  
  // Check if we're on a Google Meet page
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTab = tabs[0];
    
    if (currentTab.url && currentTab.url.includes('meet.google.com')) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Connected to Google Meet';
      meetingInfo.style.display = 'block';
      openMeetBtn.textContent = 'Refresh Assistant';
      
      // Try to get meeting info from content script
      chrome.tabs.sendMessage(currentTab.id, { type: 'getMeetingInfo' }, function(response) {
        if (response) {
          participantCount.textContent = `Participants: ${response.participants || 0}`;
          if (response.duration) {
            duration.textContent = `Duration: ${response.duration}`;
          }
        }
      });
    } else {
      statusDot.className = 'status-dot inactive';
      statusText.textContent = 'Not on Google Meet';
      meetingInfo.style.display = 'none';
      toggleAssistBtn.disabled = true;
      toggleAssistBtn.style.opacity = '0.5';
    }
  });
  
  // Open Google Meet button
  openMeetBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      
      if (currentTab.url && currentTab.url.includes('meet.google.com')) {
        // Refresh the content script
        chrome.tabs.reload(currentTab.id);
      } else {
        // Open new Google Meet tab
        chrome.tabs.create({ url: 'https://meet.google.com' });
      }
      
      window.close();
    });
  });
  
  // Toggle assistant button
  toggleAssistBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      
      if (currentTab.url && currentTab.url.includes('meet.google.com')) {
        chrome.tabs.sendMessage(currentTab.id, { type: 'toggleSidebar' });
        window.close();
      }
    });
  });
  
  // Update meeting duration every second
  let startTime = Date.now();
  setInterval(function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      
      if (currentTab.url && currentTab.url.includes('meet.google.com')) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        duration.textContent = `Duration: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    });
  }, 1000);
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'updateMeetingInfo') {
    const participantCount = document.getElementById('participantCount');
    const statusText = document.getElementById('statusText');
    
    if (participantCount) {
      participantCount.textContent = `Participants: ${message.participants || 0}`;
    }
    
    if (message.isInMeeting) {
      statusText.textContent = 'In active meeting';
    }
  }
});
