// Debounce helper
function aaDebounce(fn, wait = 100) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }

class AgentAssistSidebar {
  constructor() {
    this.processing = false;
    this.switchtoAssist = true;
    this.queue = [];
    this.state = {
      visible: false,
      currentTab: 'script', // Changed from 'score' to 'assist'
      suggestions: [],
      transcripts: [],
      scores: [],
      coaching: [],
      history: [],
      coachChat: [] // {role:'user'|'assistant', text, ts}
    };
    
    // Real-time audio streaming properties
    this.wsAudio = null;
    this.wsResults = null;
    this.audioCtx = null;
    this.micStream = null;
    this.sysStream = null;
    this.processor = null;
    this.isStreaming = false;
    this.serverReadyForAudio = false;
    this.outBuffer = [];
    
    // Audio settings (for future WebSocket integration)
    this.TARGET_SR = 16000;
    this.FRAME_MS = 20;
    this.FRAME_SAMPLES = this.TARGET_SR * this.FRAME_MS / 1000; // 320
    
    // Local speech recognition properties
    this.speechRecognition = null;
    this.localMicStream = null;
    this.speechRecognitionManualStop = false;
    this.speechRecognitionStarting = false; // Prevent multiple simultaneous starts
    this.speechRecognitionRestartTimeout = null; // Track restart attempts
    
    // User parameters (you can modify these as needed)
    this.params = {
      user_id: "rajat.kumawat@cur8.in",
      manager_id: "4248", 
      company_id: "31",
      team_id: "23",
      full_name: "Sales Agent",
      session_id: this.generateSessionId(),
      mic: '1',
      system: '0' // Set to '1' if you want system audio too
    };

    // Timer functionality for voice recorder style
    this.totalRecordedTime = 0; // Total accumulated recording time
    this.sessionTimer = null; // Active recording timer
    this.sessionStartTime = null; // When current session started
    this.isRecording = false; // Recording state
    this.displayTimer = null; // Display update timer
    this.titleUpdateInterval = null; // Title update interval
    
    // Timer state object for popup synchronization
    this.timerState = {
      isRunning: false,
      accumulatedTime: 0,
      sessionStartTime: null
    };

  // Fixed WebSocket endpoints (as provided) for audio streaming & results
  // NOTE: Per user request, query string kept exactly as supplied (including spaces)
  this.WEBSOCKET_RESULTS_URL = "wss://devreal.darwix.ai/ws/live-results?user_id=rajat.kumawat@cur8.in&manager_id=4248&company_id=31&team_id=23&full_name=Rajat kumawat&region=east";
  this.WEBSOCKET_AUDIO_URL   = "wss://devreal.darwix.ai/ws/audio-stream?user_id=rajat.kumawat@cur8.in&manager_id=4248&company_id=31&team_id=23&full_name=Rajat kumawat&region=east";

    // Removed Azure STT configuration - using WebSocket audio streaming only
    
    this.websocket = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.headerHeight = 0;
    this.lastHeaderNonZeroHeight = 0; // cache to prevent flicker
    this.contextInterval = null;
    this.underlineEl = null;
    this.floatingButton = null;
    this.layoutSelectors = [
      '.R1Qczc', '.crqnQb', '.T4LgNb', '[data-allocation-index]', 'main'
    ];
    
    // Score tracking for analysis results
    this.totalScore = 0; // Initialize total score for analysis
    
    this.init();
  }

  init() {
    // Create toggle button first thing
    this.ensureToggleButton();
    
    this.createSidebar();
    // Check font loading
    this.checkFontLoading();
    // Removed connectRealtimeWebSocket() for local development
    this.observeEnvironment();
    this.scheduleContextUpdates();
    
    // Start periodic updates for dynamic content
    this.startPeriodicUpdates();
    
    // Make sure the toggle button is still visible, but don't show the extension automatically
    setTimeout(() => {
      this.ensureToggleButton();
      // Removed automatic show() - user will need to click the button
    }, 1200);
    
    // Connect results websocket immediately
    this.connectResultsWebSocket();
    
    // Set up a periodic check to ensure the toggle button stays visible
    setInterval(() => {
      this.ensureToggleButton();
    }, 2000);
  }  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Get dynamic meeting title (completely redesigned)
  getMeetingTitle() {
    console.log('[AgentAssist][TITLE] Getting meeting title...');
    
    // Step 1: Check if meeting has started by looking for participants
    const participants = this.getParticipants();
    console.log('[AgentAssist][TITLE] Participants found:', participants);
    
    if (participants.length === 0) {
      // No participants = meeting not started
      if (this.isOnWaitingPage()) {
        console.log('[AgentAssist][TITLE] On waiting page - Meeting Not Started');
        return 'Meeting Not Started';
      }
    }
    
    // Step 2: Prioritize participant names over meeting codes
    if (participants.length > 0) {
      const title = this.generateParticipantBasedTitle(participants);
      console.log('[AgentAssist][TITLE] Generated participant-based title:', title);
      return title;
    }
    
    // Step 3: Try to get actual meeting room name/title (but avoid meeting codes)
    const meetingName = this.extractMeetingRoomName();
    if (meetingName && meetingName !== 'Google Meet' && !meetingName.startsWith('Meeting ')) {
      console.log('[AgentAssist][TITLE] Found meeting room name:', meetingName);
      return meetingName;
    }
    
    // Step 4: Final fallback
    console.log('[AgentAssist][TITLE] Using fallback title');
    return 'Team Meeting';
  }

  // Check if user is on waiting/pre-meeting page
  isOnWaitingPage() {
    // Check URL patterns
    const url = window.location.href;
    const isWaitingUrl = url.includes('meet.google.com') && 
                        (!url.includes('/') || url.endsWith('/'));
    
    // Check for waiting UI elements
    const waitingSelectors = [
      'button[aria-label*="Join"]',
      'button[aria-label*="join"]', 
      '.VfPpkd-LgbsSe[aria-label*="Join"]',
      '[data-idom-class*="join"]',
      '.P9KVBf', // Waiting room
      '.HnRr5d', // Join button
      '.NPEfkd', // Waiting indicator
      'button[jsname="b0t70b"]',
      'button[jsname="Qx7uuf"]'
    ];
    
    const hasWaitingElements = waitingSelectors.some(selector => {
      const element = document.querySelector(selector);
      return element && element.offsetParent !== null; // Element exists and is visible
    });
    
    // Check for absence of meeting interface
    const meetingSelectors = [
      '.R1Qczc', // Main video area
      '.crqnQb', // Video container
      '[data-participant-id]',
      '.XEazBc' // Participant elements
    ];
    
    const hasMeetingElements = meetingSelectors.some(selector => 
      document.querySelector(selector)
    );
    
    console.log('[AgentAssist][WAITING] URL check:', isWaitingUrl);
    console.log('[AgentAssist][WAITING] Has waiting elements:', hasWaitingElements);
    console.log('[AgentAssist][WAITING] Has meeting elements:', hasMeetingElements);
    
    return isWaitingUrl || hasWaitingElements || !hasMeetingElements;
  }

  // Extract actual meeting room name from various sources
  extractMeetingRoomName() {
    const titleSources = [
      // Method 1: Page title
      () => {
        const title = document.title;
        if (title && title.includes(' - ')) {
          const parts = title.split(' - ');
          for (const part of parts) {
            const cleaned = part.trim();
            if (cleaned && 
                cleaned !== 'Google Meet' && 
                cleaned !== 'Meet' &&
                !cleaned.includes('Google') &&
                !this.isMeetingCode(cleaned) && // Avoid meeting codes
                cleaned.length > 2) {
              return cleaned;
            }
          }
        }
        return null;
      },
      
      // Method 2: Meeting title elements
      () => {
        const selectors = [
          '[data-meeting-title]',
          '.u6vdEc',
          'h1[dir="auto"]',
          '.ZjFb7c',
          '[role="heading"]'
        ];
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            const text = element.textContent.trim();
            if (text && 
                text !== 'Google Meet' && 
                !this.isMeetingCode(text) && // Avoid meeting codes
                text.length > 2) {
              return text;
            }
          }
        }
        return null;
      }
      
      // Removed Method 3 (URL meeting code) to prevent duplication
    ];
    
    for (const source of titleSources) {
      try {
        const result = source();
        if (result) {
          console.log('[AgentAssist][TITLE] Found title from source:', result);
          return result;
        }
      } catch (error) {
        console.warn('[AgentAssist][TITLE] Error in title source:', error);
      }
    }
    
    return null;
  }

  // Helper function to detect if a string is a meeting code
  isMeetingCode(text) {
    if (!text) return false;
    
    // Check if it's a typical Google Meet code pattern (like "kgh-vdsw-cfw")
    const meetingCodePattern = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
    const generalCodePattern = /^[a-z0-9]{3,4}-[a-z0-9]{3,4}-[a-z0-9]{3,4}$/;
    
    return meetingCodePattern.test(text) || generalCodePattern.test(text);
  }

  // Generate title based on participant list
  generateParticipantBasedTitle(participants) {
    // Filter out current user variations and validate names
    const otherParticipants = participants.filter(name => {
      const lowerName = name.toLowerCase();
      return !lowerName.includes('you') && 
             !lowerName.includes('(you)') &&
             this.isRealPersonName(name) &&
             name.trim().length > 1;
    });
    
    console.log('[AgentAssist][TITLE] Valid other participants:', otherParticipants);
    
    if (otherParticipants.length === 0) {
      // Try to get a more generic meeting title if no valid participants
      const meetingInfo = this.getAlternativeMeetingInfo();
      return meetingInfo || 'Personal Meeting';
    } else if (otherParticipants.length === 1) {
      // Single participant - use full name
      return `Meeting with ${otherParticipants[0]}`;
    } else if (otherParticipants.length === 2) {
      // Two participants - show both names
      return `Meeting with ${otherParticipants[0]}, ${otherParticipants[1]}`;
    } else if (otherParticipants.length === 3) {
      // Three participants - show all three
      return `Meeting with ${otherParticipants.join(', ')}`;
    } else {
      // More than 3 - show first participant and count
      return `Meeting with ${otherParticipants[0]} and ${otherParticipants.length - 1} others`;
    }
  }

  // Check if a name looks like a real person's name
  isRealPersonName(name) {
    if (!name || typeof name !== 'string') return false;
    
    const cleaned = name.trim();
    
    // Must be reasonable length
    if (cleaned.length < 2 || cleaned.length > 30) return false;
    
    // Must contain letters
    if (!/[a-zA-Z]/.test(cleaned)) return false;
    
    // Must not be all uppercase (likely UI element)
    if (cleaned === cleaned.toUpperCase() && cleaned.length > 3) return false;
    
    // Must not contain underscores (UI elements often do)
    if (cleaned.includes('_')) return false;
    
    // Must not be a common UI pattern
    if (/^(button|link|text|label|icon|image|div|span|input|select|option|menu|item)$/i.test(cleaned)) {
      return false;
    }
    
    // Should look like a name (starts with capital letter, reasonable structure)
    const namePatterns = [
      /^[A-Z][a-z]+$/,                    // "John"
      /^[A-Z][a-z]+ [A-Z][a-z]+$/,       // "John Smith"
      /^[A-Z][a-z]+ [A-Z]\./,            // "John S."
      /^[A-Z]\. [A-Z][a-z]+$/,           // "J. Smith"
      /^[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+$/, // "John Michael Smith"
      /^[A-Z][a-z]+-[A-Z][a-z]+$/,       // "Mary-Jane"
      /^[A-Z][a-z]+\s[A-Z][a-z]+\s[A-Z][a-z]+$/, // Three names
    ];
    
    return namePatterns.some(pattern => pattern.test(cleaned));
  }

  // Get alternative meeting information when no participants found
  getAlternativeMeetingInfo() {
    // Try to get meeting time or session info
    const timeElements = document.querySelectorAll('[aria-label*="time"], [title*="time"], .notranslate');
    
    for (const element of timeElements) {
      const text = element.textContent?.trim();
      if (text && /^\d{1,2}:\d{2}/.test(text)) {
        return `Meeting Started ${text}`;
      }
    }
    
    // Check if it's a scheduled meeting
    const scheduleElements = document.querySelectorAll('[aria-label*="scheduled"], [title*="scheduled"]');
    if (scheduleElements.length > 0) {
      return 'Scheduled Meeting';
    }
    
    // Check for meeting room indicators
    const roomElements = document.querySelectorAll('[aria-label*="room"], [title*="room"]');
    if (roomElements.length > 0) {
      return 'Conference Room';
    }
    
    return null;
  }

  // Get list of participants from the meeting
  getParticipants() {
    const participants = [];
    
    // Strategy 1: Look for actual participant names in Google Meet's participant UI
    this.detectFromParticipantPanel(participants);
    
    // Strategy 2: Look for names in video tiles/grid view
    this.detectFromVideoTiles(participants);
    
    // Strategy 3: Look for names in speaker indicators
    this.detectFromSpeakerIndicators(participants);
    
    // Filter and clean up all found participants
    const cleanParticipants = participants
      .map(name => this.cleanParticipantName(name))
      .filter(name => this.isValidParticipantName(name))
      .filter((name, index, arr) => arr.indexOf(name) === index); // Remove duplicates

    console.log('[AgentAssist][PARTICIPANTS] Found participants:', cleanParticipants);
    return cleanParticipants;
  }

  // Strategy 1: Detect from participant panel/list
  detectFromParticipantPanel(participants) {
    // Look for the participant panel button and count
    const participantButtons = document.querySelectorAll('[aria-label*="participant"], [data-tooltip*="participant"], [title*="participant"]');
    
    participantButtons.forEach(button => {
      const text = button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '';
      
      // Extract number from text like "3 participants" or "Show 5 participants"
      const match = text.match(/(\d+)\s*participants?/i);
      if (match) {
        const count = parseInt(match[1]);
        console.log('[AgentAssist][PARTICIPANTS] Panel shows', count, 'participants');
        
        // Try to find the actual names if panel is open
        const participantNames = document.querySelectorAll('[data-participant-id] [jsslot] span, .uGOf1d, .zWGUib');
        participantNames.forEach(nameEl => {
          const name = nameEl.textContent?.trim();
          if (name && this.looksLikePersonName(name)) {
            participants.push(name);
          }
        });
      }
    });
  }

  // Strategy 2: Detect from video tiles in grid view
  detectFromVideoTiles(participants) {
    // Look for video tiles with participant names
    const videoSelectors = [
      '.XEazBc .notranslate', // Main video area names
      '[data-participant-id] .notranslate', // Participant video tiles
      '.TqKAX .notranslate', // Grid view names
      '.N0zzGe .notranslate', // Another grid view selector
    ];
    
    videoSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const name = element.textContent?.trim();
        if (name && this.looksLikePersonName(name)) {
          participants.push(name);
        }
      });
    });
  }

  // Strategy 3: Detect from speaker indicators and name overlays
  detectFromSpeakerIndicators(participants) {
    // Look for speaking indicators that show names
    const speakerSelectors = [
      '[aria-label*="speaking"] .notranslate',
      '[data-self-name]',
      '.zWGUib', // Active speaker name
      '.NzPR9b' // Another speaker name selector
    ];
    
    speakerSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        let name = element.getAttribute('data-self-name') || element.textContent?.trim();
        if (name && this.looksLikePersonName(name)) {
          participants.push(name);
        }
      });
    });
  }

  // Check if text looks like a person's name
  looksLikePersonName(text) {
    if (!text || typeof text !== 'string') return false;
    
    const cleaned = text.trim();
    
    // Basic validation
    if (cleaned.length < 2 || cleaned.length > 50) return false;
    
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(cleaned)) return false;
    
    // Check against common person name patterns
    const namePatterns = [
      /^[A-Z][a-z]+ [A-Z][a-z]+$/, // "John Smith"
      /^[A-Z][a-z]+$/, // "John"
      /^[A-Z][a-z]+ [A-Z]\.$/, // "John S."
      /^[A-Z]\. [A-Z][a-z]+$/, // "J. Smith"
      /^[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+$/, // "John Michael Smith"
    ];
    
    const matchesNamePattern = namePatterns.some(pattern => pattern.test(cleaned));
    
    // Additional validation: not a UI element
    const isNotUIElement = !this.isNonParticipantText(cleaned);
    
    return matchesNamePattern && isNotUIElement;
  }

  // Clean participant name
  cleanParticipantName(name) {
    if (!name) return '';
    
    let cleaned = name.trim();
    
    // Remove common suffixes/prefixes
    cleaned = cleaned.replace(/\s*\(You\)\s*/gi, '');
    cleaned = cleaned.replace(/\s*\(Host\)\s*/gi, '');
    cleaned = cleaned.replace(/\s*\(Organizer\)\s*/gi, '');
    cleaned = cleaned.replace(/\s*\(Guest\)\s*/gi, '');
    cleaned = cleaned.replace(/^.*:\s*/, ''); // Remove "Participant: " prefix
    cleaned = cleaned.replace(/\s*-\s*presenting$/i, ''); // Remove "- presenting"
    
    return cleaned.trim();
  }

  // Validate if name is a real participant
  isValidParticipantName(name) {
    if (!name || typeof name !== 'string') return false;
    
    const cleaned = name.trim().toLowerCase();
    
    // Length check
    if (cleaned.length < 2 || cleaned.length > 50) return false;
    
    // Must contain letters
    if (!/[a-zA-Z]/.test(name)) return false;
    
    // Strict filtering for Google Meet UI elements
    const strictUIFilters = [
      'domain_disabled',
      'timer_pause',
      'timer_play',
      'mic_off',
      'mic_on',
      'videocam_off',
      'videocam_on',
      'screen_share',
      'more_vert',
      'more_horiz',
      'settings',
      'participants',
      'chat',
      'present_to_all',
      'content_copy',
      'link',
      'phone',
      'closed_caption',
      'record',
      'stop',
      'pause',
      'play_arrow',
      'volume_up',
      'volume_off',
      'fullscreen',
      'pip',
      'hand',
      'raise_hand',
      'thumb_up',
      'thumb_down',
      'favorite',
      'info',
      'help',
      'error',
      'warning',
      'check',
      'close',
      'add',
      'remove',
      'edit',
      'delete',
      'search',
      'filter',
      'sort',
      'grid_view',
      'list_view',
      'view_list',
      'view_module',
      'dashboard',
      'menu',
      'arrow_back',
      'arrow_forward',
      'expand_more',
      'expand_less',
      'keyboard_arrow_up',
      'keyboard_arrow_down',
      'keyboard_arrow_left',
      'keyboard_arrow_right'
    ];
    
    // Check if it's a UI element
    if (strictUIFilters.includes(cleaned)) return false;
    
    // Check if it starts with common UI prefixes
    const uiPrefixes = ['timer_', 'mic_', 'video_', 'cam_', 'audio_', 'sound_', 'vol_'];
    if (uiPrefixes.some(prefix => cleaned.startsWith(prefix))) return false;
    
    // Check against other non-participant patterns
    if (this.isNonParticipantText(name)) return false;
    
    // Check if it's a meeting code
    if (this.isMeetingCode(name)) return false;
    
    return true;
  }

  // Helper function to filter out non-participant text
  isNonParticipantText(text) {
    if (!text) return true;
    
    const lowerText = text.toLowerCase().trim();
    
    // Google Meet UI elements and common non-participant text
    const excludePatterns = [
      // Basic UI actions
      /turn\s*on/i,
      /turn\s*off/i,
      /more/i,
      /share/i,
      /meeting/i,
      /chat/i,
      /google/i,
      /join/i,
      /leave/i,
      /mute/i,
      /unmute/i,
      /camera/i,
      /microphone/i,
      /settings/i,
      /participants/i,
      /present/i,
      /screen/i,
      /hand/i,
      /raise/i,
      /lower/i,
      
      // Common app/service names that aren't people
      /reframe/i,
      /zoom/i,
      /skype/i,
      /teams/i,
      /discord/i,
      /slack/i,
      /webex/i,
      /gotomeeting/i,
      /bluejeans/i,
      /jitsi/i,
      /whereby/i,
      /around/i,
      /loom/i,
      /calendly/i,
      /scheduler/i,
      /booking/i,
      /appointment/i,
      
      // Material Design icons (common in Google Meet)
      /^(mic|video|camera|audio|sound|volume|speaker|headset|call|phone)(_|-)?(on|off|up|down|mute|unmute)?$/i,
      /^(screen|desktop|window)(_|-)?(share|cast)?$/i,
      /^(timer|clock|time)(_|-)?(pause|play|stop|start)?$/i,
      /^(grid|list|tile)(_|-)?(view|mode)?$/i,
      /^(full|exit)(_|-)?screen$/i,
      /^(picture|pip)(_|-)?in(_|-)?picture$/i,
      /^(closed|open)(_|-)?caption[s]?$/i,
      /^(record|recording|rec)(_|-)?(start|stop|pause|resume)?$/i,
      /^(domain|network|connection)(_|-)?(disabled|enabled|error|warning)?$/i,
      
      // Google Meet specific UI elements
      /domain_disabled/i,
      /timer_pause/i,
      /timer_play/i,
      /mic_off/i,
      /mic_on/i,
      /videocam_off/i,
      /videocam_on/i,
      /content_copy/i,
      /present_to_all/i,
      /screen_share/i,
      /more_vert/i,
      /more_horiz/i,
      /keyboard_arrow/i,
      /expand_more/i,
      /expand_less/i,
      /arrow_(up|down|left|right|back|forward)/i,
      /thumb_(up|down)/i,
      /favorite/i,
      /star/i,
      /check/i,
      /close/i,
      /cancel/i,
      /error/i,
      /warning/i,
      /info/i,
      /help/i,
      /search/i,
      /filter/i,
      /sort/i,
      /add/i,
      /remove/i,
      /delete/i,
      /edit/i,
      /copy/i,
      /paste/i,
      /cut/i,
      /undo/i,
      /redo/i,
      /save/i,
      /download/i,
      /upload/i,
      /attach/i,
      /link/i,
      /unlink/i,
      /visibility/i,
      /visibility_off/i,
      /lock/i,
      /unlock/i,
      /security/i,
      /shield/i,
      /verified/i,
      /notification/i,
      /bell/i,
      /alarm/i,
      /calendar/i,
      /event/i,
      /schedule/i,
      /today/i,
      /date/i,
      /access/i,
      /permission/i,
      /admin/i,
      /owner/i,
      /guest/i,
      /invite/i,
      /invitation/i,
      
      // Numbers only
      /^\d+$/,
      
      // Non-letter content
      /^[^a-zA-Z]*$/,
      
      // Common words that appear in UI but aren't names
      /\bmeet\b/i,
      /\bgoogle\b/i,
      /\bchrome\b/i,
      /\bbrowser\b/i,
      /\btab\b/i,
      /\bwindow\b/i,
      /\bpage\b/i,
      /\bsite\b/i,
      /\bweb\b/i,
      /\bonline\b/i,
      /\boffline\b/i,
      /\bconnected\b/i,
      /\bdisconnected\b/i,
      /\bactive\b/i,
      /\binactive\b/i,
      /\benabled\b/i,
      /\bdisabled\b/i,
      /\bavailable\b/i,
      /\bunavailable\b/i,
      /\bready\b/i,
      /\bwaiting\b/i,
      /\bloading\b/i,
      /\bprocessing\b/i,
      /\bconnecting\b/i,
      /\bjoining\b/i,
      /\bleaving\b/i,
      /\bstarting\b/i,
      /\bstopping\b/i,
      /\bpausing\b/i,
      /\bresuming\b/i,
      /\bsharing\b/i,
      /\bpresenting\b/i,
      /\brecording\b/i,
      /\bmuting\b/i,
      /\bunmuting\b/i,
      
      // Technical terms
      /\bapi\b/i,
      /\burl\b/i,
      /\bhttp/i,
      /\bwww\b/i,
      /\bcom\b/i,
      /\borg\b/i,
      /\bnet\b/i,
      /\bedu\b/i,
      /\bgov\b/i,
      /\bmil\b/i,
      
      // Generic placeholder text
      /\buser\b/i,
      /\bguest\b/i,
      /\banonymous\b/i,
      /\bunknown\b/i,
      /\bdefault\b/i,
      /\btemp\b/i,
      /\btemporary\b/i,
      /\btest\b/i,
      /\bdemo\b/i,
      /\bsample\b/i,
      /\bexample\b/i,
      /\bplaceholder\b/i,
      
      // Short meaningless strings
      /^.{1}$/, // Single character
      /^[a-z]{2,3}$/, // Very short lowercase (likely abbreviations/codes)
    ];
    
    return excludePatterns.some(pattern => pattern.test(lowerText));
  }

  // Timer and time display functionality (voice recorder style)
  
  // Initialize timer system
  initializeTimerSystem() {
    // Voice recorder timer properties
    this.totalRecordedTime = 0; // Total accumulated recording time
    this.sessionTimer = null; // Active recording timer
    this.sessionStartTime = null; // When current session started
    this.isRecording = false; // Recording state
    this.displayTimer = null; // Display update timer
    
    // Initialize timer state for popup sync
    this.timerState = {
      isRunning: false,
      accumulatedTime: 0,
      sessionStartTime: null
    };
    
    console.log('[AgentAssist][TIMER] Voice recorder timer system initialized');
  }

  // Start recording session
  startSessionTimer() {
    if (this.sessionTimer) {
      console.log('[AgentAssist][TIMER] Recording already in progress');
      return;
    }
    
    this.sessionStartTime = Date.now();
    this.isRecording = true;
    
    // Update timer state for popup sync (accumulated time stays the same until session ends)
    this.timerState.isRunning = true;
    this.timerState.sessionStartTime = this.sessionStartTime;
    this.timerState.accumulatedTime = this.totalRecordedTime;
    
    // Start the recording timer (updates every second)
    this.sessionTimer = setInterval(() => {
      const currentSessionTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);
      const totalTime = this.totalRecordedTime + currentSessionTime;
      
      // Update display but keep accumulated time unchanged for popup sync
      this.updateTimerDisplay(totalTime);
    }, 1000);
    
    console.log('[AgentAssist][TIMER] Recording started - continuing from', this.formatDuration(this.totalRecordedTime));
    this.updateTimerDisplay(this.totalRecordedTime);
  }

  // Stop recording session (pause, keeps accumulated time)
  stopSessionTimer() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
      
      // Add current session time to total
      if (this.sessionStartTime) {
        const sessionDuration = Math.floor((Date.now() - this.sessionStartTime) / 1000);
        this.totalRecordedTime += sessionDuration;
        this.sessionStartTime = null;
      }
    }
    
    this.isRecording = false;
    
    // Update timer state for popup sync
    this.timerState.isRunning = false;
    this.timerState.sessionStartTime = null;
    this.timerState.accumulatedTime = this.totalRecordedTime;
    
    console.log('[AgentAssist][TIMER] Recording stopped - total time:', this.formatDuration(this.totalRecordedTime));
    
    // Update display one final time
    this.updateTimerDisplay(this.totalRecordedTime);
  }

  // Reset timer to 00:00 (for new recording session)
  resetSessionTimer() {
    this.stopSessionTimer();
    this.totalRecordedTime = 0;
    
    // Update timer state for popup sync
    this.timerState.isRunning = false;
    this.timerState.sessionStartTime = null;
    this.timerState.accumulatedTime = 0;
    
    this.updateTimerDisplay(0);
    console.log('[AgentAssist][TIMER] Timer reset to 00:00');
  }

  // Update the timer display
  updateTimerDisplay(seconds) {
    const timeElement = this.sidebar?.querySelector('.agent-assist-header__status-time');
    if (!timeElement) return;
    
    const formattedTime = this.formatDuration(seconds);
    timeElement.textContent = formattedTime;
    
    // Broadcast timer update to popup
    this.broadcastTimerUpdate();
    
    console.log(`[AgentAssist][TIMER] Display updated: ${formattedTime}`);
  }

  // Broadcast timer state to popup for synchronization
  broadcastTimerUpdate() {
    try {
      chrome.runtime.sendMessage({
        type: 'timerUpdate',
        timerState: {
          isRunning: this.timerState.isRunning,
          accumulatedTime: this.timerState.accumulatedTime,
          sessionStartTime: this.timerState.sessionStartTime
        }
      }).catch(() => {
        // Popup might not be open, that's okay
      });
    } catch (error) {
      // Chrome runtime not available, ignore
    }
  }

  // Format duration as MM:SS or HH:MM:SS
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }

  // Get current total recording time
  getTotalRecordingTime() {
    if (this.isRecording && this.sessionStartTime) {
      const currentSessionTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);
      return this.totalRecordedTime + currentSessionTime;
    }
    return this.totalRecordedTime;
  }

  // Main display update function (voice recorder style)
  updateSessionDisplay() {
    if (!this.sidebar) {
      console.log('[AgentAssist][DISPLAY] No sidebar found');
      return;
    }
    
    console.log('[AgentAssist][DISPLAY] Updating display...');
    
    // Update meeting title
    this.updateMeetingTitleDisplay();
    
    // Update timer display (voice recorder shows current recording time)
    this.updateTimerDisplay(this.getTotalRecordingTime());
    
    console.log('[AgentAssist][DISPLAY] Display update complete');
  }

  // Update meeting title in the header
  updateMeetingTitleDisplay() {
    const brandElement = this.sidebar.querySelector('.agent-assist-brand');
    if (!brandElement) {
      console.log('[AgentAssist][DISPLAY] Brand element not found');
      return;
    }
    
    const currentTitle = this.getMeetingTitle();
    const displayedTitle = brandElement.textContent;
    
    if (displayedTitle !== currentTitle) {
      brandElement.textContent = currentTitle;
      console.log(`[AgentAssist][DISPLAY] Title updated: "${displayedTitle}" → "${currentTitle}"`);
    }
  }

  // Start comprehensive periodic updates (voice recorder style)
  startPeriodicUpdates() {
    console.log('[AgentAssist][UPDATES] Starting periodic updates...');
    
    // Initialize voice recorder timer system
    this.initializeTimerSystem();
    
    // Set initial timer display to 00:00
    this.updateTimerDisplay(0);
    
    // Update meeting title more frequently (every 5 seconds) for participant changes
    this.titleUpdateInterval = setInterval(() => {
      this.updateMeetingTitleDisplay();
    }, 5000);
    
    // Also update immediately when page content changes (for faster participant detection)
    this.setupParticipantObserver();
    
    console.log('[AgentAssist][UPDATES] Periodic updates started');
  }

  // Setup observer to detect when participants join/leave
  setupParticipantObserver() {
    // Watch for changes in the main Google Meet container
    const meetContainer = document.querySelector('body');
    if (!meetContainer) return;

    // Create observer to watch for DOM changes
    this.participantObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      
      mutations.forEach((mutation) => {
        // Check if any added/removed nodes might be participant-related
        if (mutation.type === 'childList') {
          const participantSelectors = ['.notranslate', '[data-participant-id]', '.XEazBc', '.zWGUib', '.NzPR9b'];
          
          [...mutation.addedNodes, ...mutation.removedNodes].forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the node or its children match participant selectors
              const isParticipantNode = participantSelectors.some(selector => {
                return node.matches && (node.matches(selector) || node.querySelector(selector));
              });
              
              if (isParticipantNode) {
                shouldUpdate = true;
              }
            }
          });
        }
      });
      
      if (shouldUpdate) {
        // Debounce updates to avoid too frequent calls
        clearTimeout(this.participantUpdateTimeout);
        this.participantUpdateTimeout = setTimeout(() => {
          console.log('[AgentAssist][OBSERVER] Participant change detected, updating title');
          this.updateMeetingTitleDisplay();
        }, 1000);
      }
    });

    // Start observing
    this.participantObserver.observe(meetContainer, {
      childList: true,
      subtree: true
    });

    console.log('[AgentAssist][OBSERVER] Participant observer started');
  }

  // Stop all periodic updates
  stopPeriodicUpdates() {
    console.log('[AgentAssist][UPDATES] Stopping periodic updates...');
    
    this.stopSessionTimer();
    
    if (this.titleUpdateInterval) {
      clearInterval(this.titleUpdateInterval);
      this.titleUpdateInterval = null;
    }
    
    if (this.participantObserver) {
      this.participantObserver.disconnect();
      this.participantObserver = null;
    }
    
    if (this.participantUpdateTimeout) {
      clearTimeout(this.participantUpdateTimeout);
      this.participantUpdateTimeout = null;
    }
    
    console.log('[AgentAssist][UPDATES] All periodic updates stopped');
  }

  // Check if SF Pro Text is loaded
  checkFontLoading() {
    try {
      // Use the Font Loading API if available
      if ('fonts' in document) {
        document.fonts.ready.then(() => {
          const sfProLoaded = document.fonts.check('12px "SF Pro Text"');
          console.log('[AgentAssist][FONT] SF Pro Text available:', sfProLoaded);
          
          if (!sfProLoaded) {
            console.log('[AgentAssist][FONT] SF Pro Text not found, using system fallbacks');
            // Update CSS custom property to skip SF Pro Text
            document.documentElement.style.setProperty(
              '--aa-font-family', 
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
            );
          }
        });
      } else {
        // Fallback for older browsers
        console.log('[AgentAssist][FONT] Font Loading API not supported, using fallbacks');
      }
    } catch (error) {
      console.warn('[AgentAssist][FONT] Font loading check failed:', error);
    }
  }

  ensureToggleButton() {
    // If button exists, just ensure it's visible and return
    if (this.toggleButton && document.body.contains(this.toggleButton)) {
      // Always make sure toggle button is visible
      this.toggleButton.style.display = 'flex';
      this.toggleButton.style.opacity = '1';
      this.toggleButton.style.zIndex = '999998';
      return;
    }
    
    // Create new toggle button with logo image
    const btn = document.createElement('button');
    btn.className = 'agent-assist-toggle';
    btn.id = 'agent-assist-fixed-toggle'; // Add ID for easier targeting
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle Agent Assist');
    btn.setAttribute('aria-pressed', 'false');
    
    // Use the logo image instead of SVG
    const logoUrl = chrome.runtime.getURL('icons/logo.png');
    btn.innerHTML = `<img src="${logoUrl}" alt="Toggle Agent Assist" class="agent-assist-toggle-logo">`;
    
    // Enhanced click handler for better reliability
    const clickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[TOGGLE] External button clicked - current state:', this.state.visible);
      this.toggle();
    };
    
    btn.addEventListener('click', clickHandler);
    
    // Add to document
    document.body.appendChild(btn);
    this.toggleButton = btn;
    
    // Set proper styles to ensure it's always visible and fixed
    btn.style.position = 'fixed';
    btn.style.zIndex = '999998';
    btn.style.cursor = 'pointer';
    btn.style.display = 'flex';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    
    // Make absolutely sure it's fixed and unchangeable
    Object.defineProperty(btn.style, 'display', {
      get: function() { return 'flex'; },
      set: function(v) { /* Ignore attempts to change display */ }
    });
    
    // Add observer to make sure it stays visible
    this.startToggleButtonObserver();
    
    console.log('[AgentAssist] Fixed external toggle button created');
    
    // Add global debugging functions
    window.debugAgentAssist = () => {
      console.log('=== Agent Assist Debug Info ===');
      console.log('State visible:', this.state.visible);
      console.log('Sidebar exists:', !!this.sidebar);
      console.log('Toggle button exists:', !!this.toggleButton);
      if (this.sidebar) {
        console.log('Sidebar classes:', this.sidebar.className);
        console.log('Sidebar transform:', this.sidebar.style.transform);
        console.log('Sidebar opacity:', this.sidebar.style.opacity);
        console.log('Sidebar pointer-events:', this.sidebar.style.pointerEvents);
        console.log('Sidebar data-user-positioned:', this.sidebar.hasAttribute('data-user-positioned'));
      }
      if (this.toggleButton) {
        console.log('Toggle button display:', this.toggleButton.style.display);
        console.log('Toggle button opacity:', this.toggleButton.style.opacity);
      }
    };
    
    window.forceHideAgentAssist = () => {
      console.log('=== Force Hide Agent Assist ===');
      this.hide();
    };
    
    window.forceShowAgentAssist = () => {
      console.log('=== Force Show Agent Assist ===');
      this.show();
    };
    
    window.testScoreTab = () => {
      console.log('=== Testing Score Tab ===');
      this.updateScore(73, 'Good performance on key metrics');
      this.switchTab('score');
      this.show();
    };
  }
  
  // New method to ensure the toggle button stays visible
  startToggleButtonObserver() {
    if (!this.toggleButton) return;
    
    // Use MutationObserver to keep button visible if something tries to hide it
    const observer = new MutationObserver((mutations) => {
      if (this.toggleButton) {
        // Force visibility regardless of what other scripts might do
        this.toggleButton.style.display = 'flex';
        this.toggleButton.style.opacity = '1';
        this.toggleButton.style.zIndex = '999998';
      }
    });
    
    // Observe the button for style changes
    observer.observe(this.toggleButton, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    
    // Also set interval as a backup to ensure visibility
    setInterval(() => {
      if (this.toggleButton && document.body.contains(this.toggleButton)) {
        this.toggleButton.style.display = 'flex';
        this.toggleButton.style.opacity = '1';
        this.toggleButton.style.zIndex = '999998';
      }
    }, 500);
  }

  createSidebar() {
    if (this.sidebar && document.body.contains(this.sidebar)) return;
    const el = document.createElement('section');
    el.className = 'agent-assist-sidebar';
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Agent Assist');
    el.innerHTML = `
      <div class="agent-assist-drag-handle"></div>
      <header class="agent-assist-header">
        <div class="agent-assist-header__logo" style="background-image: url('${chrome.runtime.getURL('icons/logo.png')}')"></div>
        <div class="agent-assist-header__info">
          <div class="agent-assist-brand">${this.getMeetingTitle()}</div>
          <div class="agent-assist-header__status">
            <div class="agent-assist-header__status-dot"></div>
            <span class="agent-assist-header__status-time">00:00</span>
          </div>
        </div>
        <div class="agent-assist-header__actions">
          <button class="minimize-toggle" aria-label="Minimize Extension" title="Minimize Extension">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.67">
              <line x1="4.17" y1="10" x2="15.83" y2="10"/>
            </svg>
          </button>
          <button class="mic-toggle" aria-label="Toggle Microphone" title="Toggle Microphone">
            <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <svg class="stop-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.67" style="display: none;">
              <rect x="2.5" y="2.5" width="15" height="15" rx="0" ry="0"/>
              <line x1="8.33" y1="7.5" x2="8.33" y2="12.5"/>
              <line x1="11.67" y1="7.5" x2="11.67" y2="12.5"/>
            </svg>
          </button>
        </div>
      </header>
      <div class="agent-assist-tabs">
        <div class="agent-assist-tablist" role="tablist" aria-label="Agent Assist Tabs">
          ${['assist','script','score','history','coach'].map(t=>`<button role="tab" aria-selected="${t==='script'}" tabindex="${t==='script'?0:-1}" class="agent-assist-tab" data-tab="${t}" id="aa-tab-${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div class="agent-assist-content" id="aa-panel" role="tabpanel" aria-labelledby="aa-tab-score"></div>
    `;
    const micToggle = el.querySelector('.mic-toggle');
    this.micHandler = () => this.toggleMicrophone();
    micToggle.addEventListener('click', this.micHandler);
    
    const minimizeToggle = el.querySelector('.minimize-toggle');
    console.log('[DEBUG] Minimize toggle found:', !!minimizeToggle);
    if (minimizeToggle) {
      this.minimizeHandler = () => {
        console.log('[DEBUG] Minimize button clicked!');
        this.forceHideExtension();
      };
      minimizeToggle.addEventListener('click', this.minimizeHandler);
      console.log('[DEBUG] Minimize event handler attached');
    } else {
      console.error('[DEBUG] Minimize toggle not found in sidebar');
    }
    
    document.body.appendChild(el);
    this.sidebar = el;
    this.underlineEl = el.querySelector('.agent-assist-tab-underline');
    
    // Add double-click to reset timer functionality
    const timeElement = el.querySelector('.agent-assist-header__status-time');
    if (timeElement) {
      timeElement.addEventListener('dblclick', () => {
        if (!this.isRecording) {
          this.resetSessionTimer();
          console.log('[AgentAssist][TIMER] Timer reset by user double-click');
        }
      });
      timeElement.style.cursor = 'pointer';
      timeElement.title = 'Double-click to reset timer (when not recording)';
    }
    
    this.addTabListeners();
    this.setupDraggable();
    this.renderCurrentTab();
    this.reposition();
  }

  toggleMicrophone() {
    const micButton = this.sidebar.querySelector('.mic-toggle');
    const micIcon = micButton.querySelector('.mic-icon');
    const stopIcon = micButton.querySelector('.stop-icon');
    const isActive = micButton.classList.contains('active');
    
    console.log('[AgentAssist][MIC] Button state - isActive:', isActive, 'isStreaming:', this.isStreaming);
    
    if (!isActive) {
      console.log('[AgentAssist][MIC] Starting continuous transcription...');
      
      // Start session timer with new system
      this.startSessionTimer();
      
      // Ensure audio websocket is connected before streaming
      this.connectAudioWebSocket();
      this.startLocalStreaming();
      
      // Change button to stop state
      micButton.classList.add('active');
      micButton.style.background = '#FDE9E9';
      micButton.style.color = '#EB1F26';
      micButton.title = 'Stop Transcription';
      micButton.setAttribute('aria-label', 'Stop Transcription');
      
      // Switch icons
      micIcon.style.display = 'none';
      stopIcon.style.display = 'block';
      
    } else {
      console.log('[AgentAssist][MIC] Stopping transcription...');
      
      // Stop session timer with new system
      this.stopSessionTimer();
      
      this.pauseLocalStreaming();
      
      // Change button back to mic state
      micButton.classList.remove('active');
      micButton.style.background = 'var(--aa-accent-red)';
      micButton.style.color = '#EB1F26';
      micButton.title = 'Start Transcription';
      micButton.setAttribute('aria-label', 'Toggle Microphone');
      
      // Switch icons back
      micIcon.style.display = 'block';
      stopIcon.style.display = 'none';
    }
  }

  rebindEventHandlers() {
    if (!this.sidebar) return;
    
    console.log('[DRAG] Rebinding event handlers after drag...');
    
    // Rebind minimize button with improved binding
    const minimizeToggle = this.sidebar.querySelector('.minimize-toggle');
    console.log('[DRAG] Rebinding minimize toggle, found:', !!minimizeToggle);
    if (minimizeToggle) {
      // Clean up old event listeners completely
      if (this.minimizeHandler) {
        minimizeToggle.removeEventListener('click', this.minimizeHandler);
      }
      // Clone the button to remove all event listeners
      const newMinimizeToggle = minimizeToggle.cloneNode(true);
      minimizeToggle.parentNode.replaceChild(newMinimizeToggle, minimizeToggle);
      
      // Create new handler and bind it
      this.minimizeHandler = (e) => {
        console.log('[DEBUG] Minimize button clicked after rebind!');
        e.stopPropagation();
        e.preventDefault();
        this.forceHideExtension();
      };
      newMinimizeToggle.addEventListener('click', this.minimizeHandler);
      
      // Ensure button is usable
      newMinimizeToggle.style.pointerEvents = 'auto';
      newMinimizeToggle.style.zIndex = '1000000';
      newMinimizeToggle.style.position = 'relative';
      newMinimizeToggle.style.cursor = 'pointer';
      
      console.log('[DRAG] Minimize button rebound with enhanced handlers');
    } else {
      console.error('[DRAG] Minimize toggle not found during rebind');
    }
    
    // Rebind microphone button
    const micToggle = this.sidebar.querySelector('.mic-toggle');
    if (micToggle) {
      // Clean up old event listeners completely
      if (this.micHandler) {
        micToggle.removeEventListener('click', this.micHandler);
      }
      // Clone the button to remove all event listeners
      const newMicToggle = micToggle.cloneNode(true);
      micToggle.parentNode.replaceChild(newMicToggle, micToggle);
      
      // Create new handler and bind it
      this.micHandler = (e) => {
        e.stopPropagation();
        this.toggleMicrophone();
      };
      newMicToggle.addEventListener('click', this.micHandler);
      
      // Ensure button is usable
      newMicToggle.style.pointerEvents = 'auto';
      newMicToggle.style.zIndex = '1000000';
      newMicToggle.style.position = 'relative';
      
      console.log('[DRAG] Microphone button rebound with enhanced handlers');
    }
    
    // Rebind tab buttons
    const tabButtons = this.sidebar.querySelectorAll('.agent-assist-tab');
    tabButtons.forEach(btn => {
      // Clone to remove all event listeners
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      // Create new handler and bind it
      newBtn._tabHandler = () => this.switchTab(newBtn.dataset.tab);
      newBtn.addEventListener('click', newBtn._tabHandler);
    });
    console.log('[DRAG] Tab buttons rebound');
    
    console.log('[DRAG] All event handlers successfully rebound');
  }

  forceHideExtension() {
    console.log('[AgentAssist][FORCE_HIDE] Force hiding extension via minimize button');
    this.hide();
  }

  minimizeExtension() {
    console.log('[AgentAssist][MINIMIZE] Minimizing extension...');
    console.log('[AgentAssist][MINIMIZE] Sidebar state before hide:', this.state.visible);
    
    // Force any pending transitions to complete
    if (this.sidebar) {
      this.sidebar.style.transition = 'none';
    }
    
    // Save position before hiding if user positioned
    let userPosition = null;
    if (this.sidebar && this.sidebar.hasAttribute('data-user-positioned')) {
      userPosition = {
        left: this.sidebar.style.left,
        top: this.sidebar.style.top,
        position: 'fixed'
      };
      console.log('[AgentAssist][MINIMIZE] Saved user position:', userPosition);
    }
    
    // Hide the main sidebar
    this.hide();
    
    console.log('[AgentAssist][MINIMIZE] Sidebar state after hide:', this.state.visible);
    
    // Show the existing toggle button (don't create a new one)
    this.ensureToggleButton();
    
    // Save user position for next show
    if (userPosition) {
      // Store position for next show
      this._savedUserPosition = userPosition;
    }
    
    console.log('[AgentAssist][MINIMIZE] Minimize complete');
    
    // Add a global test function for debugging
    window.testMinimize = () => {
      console.log('[DEBUG] Test minimize called');
      this.minimizeExtension();
    };
    
    // Add restore test function
    window.testRestore = () => {
      console.log('[DEBUG] Test restore called');
      this.show();
    };
  }

  createFloatingToggle() {
    // This method is no longer needed since we reuse the main toggle button
    console.log('[AgentAssist][DEPRECATED] createFloatingToggle - using main toggle instead');
  }

  restoreExtension() {
    console.log('[AgentAssist][RESTORE] Restoring extension...');
    
    // Show the main sidebar (toggle button will be hidden automatically)
    this.show();
  }

  stopExtension() {
    console.log('[AgentAssist][STOP] Stopping extension...');
    
    // Stop all periodic updates
    this.stopPeriodicUpdates();
    
    // Stop microphone streaming
    this.pauseLocalStreaming();
    
    // Close websocket connections
    if (this.wsResults) {
      this.wsResults.close();
      this.wsResults = null;
    }
    if (this.wsAudio) {
      this.wsAudio.close();
      this.wsAudio = null;
    }
    
    // Hide sidebar
    this.hide();
    
    // Clean up DOM elements
    if (this.sidebar && document.body.contains(this.sidebar)) {
      document.body.removeChild(this.sidebar);
      this.sidebar = null;
    }
    if (this.toggleButton && document.body.contains(this.toggleButton)) {
      document.body.removeChild(this.toggleButton);
      this.toggleButton = null;
    }
    if (this.floatingButton && document.body.contains(this.floatingButton)) {
      document.body.removeChild(this.floatingButton);
      this.floatingButton = null;
    }
    
    console.log('[AgentAssist][STOP] Extension stopped successfully');
  }

masterDelay = 10000;
delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async handleCategory(category) {
  let formattedData = [];
  if (Array.isArray(category)) {
    formattedData = category;
  } else if (typeof category === 'object' && category !== null) {
    formattedData = [category];
  } else {
    return;
  }
  for (const item of formattedData) {
    console.log('formattedData Handled:', item.subcat);
    let subcat_status = "", missedLabel = "", nudgeClass = "";
    const nudgeText = typeof item.nudges === 'string' ? item.nudges.trim() : '';
    if (item.value === 'Yes') {
      subcat_status = "completed";
      nudgeClass = 'completed';
    } else if (item.value === 'Partial Yes') {
      nudgeClass = 'quickAction';
    } else if (item.value === 'No' || item.value === undefined) {
      subcat_status = "missed";
      nudgeClass = 'missednudge';
    } else if (item.value === 'NA') {
      subcat_status = "missed";
      missedLabel = `<span class="paraStatus">Missed</span>`;
      nudgeClass = 'missednudge';
    }
    const nudgesHTML = nudgeText !== '' ? `
      <div class="aa-suggestion ${nudgeClass}">
        <h5>${item.subcat}</h5>
        <ul>
          ${nudgeText.split('\n').map(n => `<li>${n.trim()}</li>`).join('')}
        </ul>  
      </div>` : '';
    await this.delay(this.masterDelay);
    this.state.suggestions.push(nudgesHTML);
  }
  if(this.switchtoAssist){
    this.switchTab('assist'); 
    this.switchtoAssist = false;
  }
   // Switch tab after all items rendered
}
  
async processQueue() {
    while (this.queue.length > 0) {
      //console.log(this.queue);
        const category = this.queue.shift();
        await this.handleCategory(category);
    }
    this.processing = false;
}
  formatData(obj) {
        let result = [];
        for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (obj[key].title) {
                    let mainCategory = {
                        cat: obj[key].title,
                        catscore: obj[key].cat_score,
                        maxscore: obj[key].max_score,
                        covered_subcat: obj[key].covered_subcat,
                        totalsubcat: obj[key].total_subcat,
                        subcategories: [],
                        show_nudge: obj[key].show_nudge
                    };
                    for (const subKey in obj[key].content) {
                        if (typeof obj[key].content[subKey] === 'object' && obj[key].content[subKey].title) {
                            let subEntry = { subcat: obj[key].content[subKey].title };

                            if (obj[key].content[subKey].value) subEntry.value = obj[key].content[subKey].value;
                            if (obj[key].content[subKey].reason) subEntry.reason = obj[key].content[subKey].reason;
                            if (obj[key].content[subKey].sentence) subEntry.sentence = obj[key].content[subKey].sentence;
                            if (obj[key].content[subKey].total_score) subEntry.total_score = obj[key].content[subKey].total_score;
                            if (obj[key].content[subKey].nudges) subEntry.nudges = obj[key].content[subKey].nudges;
                            if (obj[key].content[subKey].score) subEntry.score = obj[key].content[subKey].score;

                            mainCategory.subcategories.push(subEntry);
                        }
                    }

                    result.push(mainCategory);
                }
            }
        }
        return result;
  }
  // Connect to live results websocket (receives JSON objects)
  connectResultsWebSocket() {
    try {
      if (this.wsResults && (this.wsResults.readyState === WebSocket.OPEN || this.wsResults.readyState === WebSocket.CONNECTING)) return;
      console.log('[AgentAssist][WS][RESULTS] Connecting...');
      this.wsResults = new WebSocket(this.WEBSOCKET_RESULTS_URL);
      this.wsResults.onopen = () => {
        console.log('[AgentAssist][WS][RESULTS] Connected');
      };
      this.wsResults.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          console.log('[AgentAssist][WS][RESULTS] Object:', data); // per user: log objects to console
          if (data.action === 'transcript' && data.data) {
            this.state.transcripts.push({
              speaker: data.data.speaker,
              text:    data.data.transcript,
              timestamp: data.data.timestamp
            });
            if (this.state.currentTab === 'script') {
              this.renderCurrentTab();
            }
          }
         if (data.action === 'analysis' && data.analysis_result !== undefined) {
            const formattedData = this.formatData(data.analysis_result.response);
            console.log(formattedData)
            
            // Calculate total score from all cat_score values
            if (Array.isArray(formattedData)) {
              let tempScore = 0;
              formattedData.forEach(catObj => {
                if (catObj.catscore !== undefined && catObj.catscore !== null) {

                  tempScore += Number(catObj.catscore);
                  console.log(catObj.catscore, 'CatScore:' + tempScore);
                }
              });
              console.log(tempScore)
              console.log(this.tempScore)
              this.totalScore = tempScore;
            }
            console.log('[AgentAssist][SCORE] Total calculated score:', this.totalScore);
          
            
            // Update score tab if it's currently active
            if (this.state.currentTab === 'score') {
              this.renderCurrentTab();
            }
            
            if (Array.isArray(formattedData)) {
              formattedData.forEach(catObj => {
                if (catObj.show_nudge && Array.isArray(catObj.subcategories)) {
                  catObj.subcategories.forEach(subcatObj => {
                    console.log(subcatObj);
                    this.queue.push(subcatObj);
                  });
                }
              });
              this.processing = true;
              this.processQueue()
            }


            //this.state.suggestions.push(formattedData);
           // this.switchTab('assist');
          }
          
          




        } catch(e){ console.warn('[AgentAssist][WS][RESULTS] Non-JSON message', evt.data); }
      };
      this.wsResults.onerror = (e) => { console.error('[AgentAssist][WS][RESULTS] Error', e); };
      this.wsResults.onclose = (e) => { console.log('[AgentAssist][WS][RESULTS] Closed', e.code, e.reason); setTimeout(()=>this.connectResultsWebSocket(), 3000); };
    } catch(err){ console.error('[AgentAssist][WS][RESULTS] Connect failed', err); }
  }
  
  // Connect to audio websocket (send raw 16k PCM little-endian Int16 frames)
  connectAudioWebSocket() {
    try {
      if (this.wsAudio && (this.wsAudio.readyState === WebSocket.OPEN || this.wsAudio.readyState === WebSocket.CONNECTING)) return;
      console.log('[AgentAssist][WS][AUDIO] Connecting...');
      this.wsAudio = new WebSocket(this.WEBSOCKET_AUDIO_URL);
      this.wsAudio.binaryType = 'arraybuffer';
      this.wsAudio.onopen = () => {
        console.log('[AgentAssist][WS][AUDIO] Connected');
        // Flush any queued frames
        if (this._pendingAudioFrames && this._pendingAudioFrames.length) {
          this._pendingAudioFrames.forEach(f=>{ try { this.wsAudio.send(f); } catch(e){} });
          this._pendingAudioFrames = [];
        }
      };
      this.wsAudio.onerror = (e) => { console.error('[AgentAssist][WS][AUDIO] Error', e); };
      this.wsAudio.onclose = (e) => { console.log('[AgentAssist][WS][AUDIO] Closed', e.code, e.reason); setTimeout(()=>this.connectAudioWebSocket(), 3000); };
    } catch(err){ console.error('[AgentAssist][WS][AUDIO] Connect failed', err); }
  }

  // Send Float32Array audio (any sample rate) as 16k PCM Int16 frames to audio websocket
  sendAudioFrame(float32, sr) {
    if (!float32 || !float32.length) return;
    // Resample if needed (simple decimation for now)
    if (sr !== this.TARGET_SR) {
      float32 = this.downsampleFloat32(float32, sr, this.TARGET_SR);
      sr = this.TARGET_SR;
    }
    // Convert to Int16 little-endian
    const pcm16 = new Int16Array(float32.length);
    for (let i=0;i<float32.length;i++){ let s=float32[i]; s = Math.max(-1, Math.min(1, s)); pcm16[i] = s<0 ? s*0x8000 : s*0x7FFF; }
    const buf = pcm16.buffer;
    if (this.wsAudio && this.wsAudio.readyState === WebSocket.OPEN) {
      try { this.wsAudio.send(buf); } catch(e){ console.warn('[AgentAssist][WS][AUDIO] Send failed', e); }
    } else {
      this._pendingAudioFrames = this._pendingAudioFrames || [];
      this._pendingAudioFrames.push(buf);
    }
  }

  // Local streaming simulation for development
  startLocalStreaming() {
    if (this.isStreaming) return;
    
    console.log('[AgentAssist] Starting continuous transcription mode...');
    this.isStreaming = true;
    this.speechRecognitionManualStop = false;
    
    // Removed suggestion to keep assist tab blank
    
    // Start real microphone capture and speech recognition
    this.startLocalSpeechRecognition();
    
    // Also start capturing tab audio for other participants
    this.startTabAudioCapture();
  }

  pauseLocalStreaming() {
    if (!this.isStreaming) return;
    
    console.log('[AgentAssist] Pausing transcription (can be resumed)...');
    this.isStreaming = false;
    this.speechRecognitionManualStop = true;
    
    // Clear any pending restart attempts
    if (this.speechRecognitionRestartTimeout) {
      clearTimeout(this.speechRecognitionRestartTimeout);
      this.speechRecognitionRestartTimeout = null;
    }
    
    // Pause speech recognition (but keep setup for quick restart)
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      // Don't set to null - keep the instance for restart
    }
    
    // Pause microphone stream temporarily
    if (this.localMicStream) {
      this.localMicStream.getTracks().forEach(track => track.enabled = false);
    }

    // Note: We keep tab audio resources active for quick resume
  }

  stopLocalStreaming() {
    if (!this.isStreaming) return;
    
    console.log('[AgentAssist] Stopping local mode...');
    this.isStreaming = false;
    this.speechRecognitionManualStop = true;
    
    // Clear any pending restart attempts
    if (this.speechRecognitionRestartTimeout) {
      clearTimeout(this.speechRecognitionRestartTimeout);
      this.speechRecognitionRestartTimeout = null;
    }
    
    // Reset speech recognition state
    this.speechRecognitionStarting = false;
    
    // Stop speech recognition
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      this.speechRecognition = null;
    }
    
    // Stop microphone stream
    if (this.localMicStream) {
      this.localMicStream.getTracks().forEach(track => track.stop());
      this.localMicStream = null;
    }

    // Clean up tab audio resources
    this.cleanupTabAudio();

    // Optionally keep results socket; don't close here
  }

  // Explicit full shutdown (mic + websockets)
  shutdownAll() {
    this.stopLocalStreaming();
    try { if (this.wsAudio) { this.wsAudio.close(); this.wsAudio = null; } } catch(e){}
    // Leave results websocket to auto-reconnect unless explicit
  }

  // Real microphone capture with Azure STT
  async startLocalSpeechRecognition() {
    try {
      console.log('[AgentAssist][MIC] Starting microphone capture and Azure STT...');
      
      // Don't start if already starting or running
      if (this.speechRecognitionStarting || (this.speechRecognition && this.speechRecognition.state === 'recording')) {
        console.log('[AgentAssist][MIC] Speech recognition already running or starting, skipping...');
        return;
      }
      
      // Request microphone access
      console.log('[AgentAssist][MIC] Requesting microphone access...');
      this.localMicStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000
        } 
      });
      console.log('[AgentAssist][MIC] Microphone access granted');
      
      // Set up audio processing for Azure STT
      console.log('[AgentAssist][MIC] Setting up audio processing pipeline...');
      this.setupLocalAudioProcessing(this.localMicStream);
      
    } catch (error) {
      console.error('[AgentAssist][MIC] Error setting up microphone capture:', error);
    }
  }

  // Set up local audio processing for Azure STT
  setupLocalAudioProcessing(stream) {
    try {
      console.log('[AgentAssist][MIC] Setting up local audio processing...');
      
      // Create audio context
      this.localAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.localAudioContext;
      console.log('[AgentAssist][MIC] Audio context created, sample rate:', ctx.sampleRate);
      
      // Create media stream source
      const source = ctx.createMediaStreamSource(stream);
      console.log('[AgentAssist][MIC] Media stream source created');
      
      // Load audio worklet for VAD
      ctx.audioWorklet.addModule(chrome.runtime.getURL('audio-vad-processor.js')).then(() => {
        console.log('[AgentAssist][MIC] Audio worklet loaded successfully');
        
        // Create VAD processor
        this.localAudioNode = new AudioWorkletNode(ctx, 'vad-processor', {
          processorOptions: {
            vadThreshold: 0.013,
            minMs: 300,
            maxMs: 8000,
            silenceMs: 500
          }
        });
        console.log('[AgentAssist][MIC] VAD processor created');
        
        // Connect audio pipeline
        source.connect(this.localAudioNode);
        console.log('[AgentAssist][MIC] Audio pipeline connected');
        
        // Handle VAD segments
        this.localAudioNode.port.onmessage = (event) => {
          const data = event.data;
          if (data?.type === 'segment') {
            if (!data.enough) {
              console.log('[AgentAssist][MIC] Speech segment too short, skipping');
              return;
            }
            console.log('[AgentAssist][MIC] Speech segment detected, length:', data.samples.length, 'samples');
            this.handleLocalSegment(data.samples, data.sampleRate);
          }
        };
        
        this.localAudioNode.port.onmessageerror = e => {
          console.warn('[AgentAssist][MIC] Worklet port error', e);
        };
        
        console.log('[AgentAssist][MIC] Local audio processing pipeline ready');
        
      }).catch(err => {
        console.error('[AgentAssist][MIC] Failed to load audio worklet:', err);
        console.log('[AgentAssist][MIC] Falling back to Web Speech API only');
        this.setupWebSpeechAPI();
      });
      
    } catch (error) {
      console.error('[AgentAssist][MIC] Error setting up local audio processing:', error);
    }
  }

  // Handle local audio segments
  handleLocalSegment(float32, sr) {
    console.log('[AgentAssist][MIC] Processing local audio segment...');
    
    // Downsample if needed
    if (sr !== this.TARGET_SR) {
      console.log('[AgentAssist][MIC] Downsampling from', sr, 'to', this.TARGET_SR);
      float32 = this.downsampleFloat32(float32, sr, this.TARGET_SR);
      sr = this.TARGET_SR;
    }
    
    // Stream raw audio to websocket
    this.sendAudioFrame(float32, sr);
  }  // Send local audio segment to Azure STT - REMOVED
  // Now using WebSocket audio streaming only

  // Set up Web Speech API as backup
  setupWebSpeechAPI() {
    try {
      console.log('[AgentAssist][MIC] Setting up Web Speech API as backup...');
      
      // Check if browser supports Speech Recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.log('[AgentAssist][MIC] Speech Recognition not supported in this browser');
        return;
      }
      
      // Setup speech recognition (only if not already created)
      if (!this.speechRecognition) {
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.lang = 'en-US';
        this.speechRecognition.maxAlternatives = 1;
        console.log('[AgentAssist][MIC] Speech recognition object created');
      }
      
      // Only set up event handlers if not already set
      if (!this.speechRecognition._handlersSet) {
        console.log('[AgentAssist][MIC] Setting up speech recognition event handlers...');
        
        // Handle speech recognition results
        this.speechRecognition.onresult = (event) => {
          console.log('[AgentAssist][MIC] Web Speech API result received');
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            const isFinal = event.results[i].isFinal;
            
            if (isFinal) {
              console.log('[AgentAssist][MIC] Web Speech API final transcript:', transcript);
              this.addTranscript('You (Web Speech)', transcript.trim(), Date.now());
            } else {
              console.log('[AgentAssist][MIC] Web Speech API interim transcript:', transcript);
            }
          }
        };
        
        this.speechRecognition.onstart = () => {
          console.log('[AgentAssist][MIC] Web Speech API started');
          this.speechRecognitionStarting = false;
        };
        
        this.speechRecognition.onerror = (event) => {
          console.log('[AgentAssist][MIC] Web Speech API error:', event.error);
          
          if (event.error === 'no-speech') {
            console.log('[AgentAssist][MIC] No speech detected (normal)');
            return;
          }
          
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            console.error('[AgentAssist][MIC] Microphone access denied');
            return;
          }
        };
        
        this.speechRecognition.onend = () => {
          console.log('[AgentAssist][MIC] Web Speech API ended');
          
          if (this.isStreaming && !this.speechRecognitionManualStop && !this.speechRecognitionStarting) {
            console.log('[AgentAssist][MIC] Restarting Web Speech API...');
            setTimeout(() => {
              if (this.isStreaming && !this.speechRecognitionManualStop) {
                try {
                  this.speechRecognition.start();
                  console.log('[AgentAssist][MIC] Web Speech API restarted');
                } catch (e) {
                  console.error('[AgentAssist][MIC] Failed to restart Web Speech API:', e);
                }
              }
            }, 100);
          }
        };
        
        // Mark handlers as set
        this.speechRecognition._handlersSet = true;
        console.log('[AgentAssist][MIC] Web Speech API event handlers set');
      }
      
      // Start recognition
      this.speechRecognitionStarting = true;
      this.speechRecognition.start();
      console.log('[AgentAssist][MIC] Web Speech API started');
      
    } catch (error) {
      console.error('[AgentAssist][MIC] Error setting up Web Speech API:', error);
    }
  }

  // Helper function to schedule speech recognition restart
  scheduleSpeechRecognitionRestart(delay) {
    // Clear any existing restart timeout
    if (this.speechRecognitionRestartTimeout) {
      clearTimeout(this.speechRecognitionRestartTimeout);
    }
    
    this.speechRecognitionRestartTimeout = setTimeout(() => {
      if (this.isStreaming && !this.speechRecognitionManualStop && !this.speechRecognitionStarting) {
        this.restartSpeechRecognition();
      }
    }, delay);
  }

  // Helper function to restart speech recognition
  restartSpeechRecognition() {
    if (!this.isStreaming || this.speechRecognitionManualStop || this.speechRecognitionStarting) {
      return;
    }
    
    try {
      if (this.speechRecognition) {
        this.speechRecognitionStarting = true;
        this.speechRecognition.start();
        console.log('[AgentAssist] Speech recognition restarted successfully');
      } else {
        // Recreate speech recognition if it was lost
        console.log('[AgentAssist] Recreating speech recognition...');
        this.startLocalSpeechRecognition();
      }
    } catch (e) {
      console.error('[AgentAssist] Failed to restart speech recognition:', e);
      this.speechRecognitionStarting = false;
      
      // Try to recreate after delay if still streaming
      if (this.isStreaming && !this.speechRecognitionManualStop) {
        this.scheduleSpeechRecognitionRestart(2000);
      }
    }
  }

  // Audio processing functions (for future use)
  downsampleFloat32(float32Array, inputRate, targetRate) {
    if (targetRate === inputRate) return float32Array;
    const ratio = inputRate / targetRate;
    const outLength = Math.floor(float32Array.length / ratio);
    const out = new Float32Array(outLength);
    let pos = 0;
    for (let i = 0; i < outLength; i++) {
      out[i] = float32Array[Math.floor(pos)] || 0;
      pos += ratio;
    }
    return out;
  }

  addResult(message, type = "") {
    console.log('[AgentAssist]', message);
    // Removed all suggestion adding to keep assist tab blank
  }

  processTranscriptMessage(msg){
    try {
      const p = msg.data || {};
      const text = p.transcript || p.translated_transcript || '';
      if (!text) { 
        console.log('[AgentAssist][TRANSCRIPT] Empty transcript field'); 
        return; 
      }
      const speaker = p.speaker || 'Agent';
      const ts = p.timestamp || msg.timestamp || Date.now();
      console.log('[AgentAssist][TRANSCRIPT] +', speaker, '=>', text);
      
      // Only add to transcript tab, not to suggestions
      this.addTranscriptOnly(speaker, text, ts);
    } catch(err){ 
      console.warn('[AgentAssist][TRANSCRIPT] process error', err); 
    }
  }

  // New function to add transcript without any logging
  addTranscriptOnly(speaker, text, timestamp) {
  // Filter out system/meta messages from appearing in transcript tab
  if (!speaker || speaker.toLowerCase() === 'system') return;
  this.state.transcripts.push({ speaker, text, timestamp: timestamp || Date.now() });
  if (this.state.currentTab === 'script') this.renderCurrentTab();
  }

  // Enhanced function to add transcript with proper alignment
  addTranscript(speaker, text, timestamp) {
    if (!speaker) return;
    if (speaker.toLowerCase() === 'system') { // suppress system messages in visible transcript
      console.log('[AgentAssist][SYSTEM]', text);
      return;
    }
    const isUser = /^(you|user|self)$/i.test(speaker);
    const displaySpeaker = isUser ? 'You' : (speaker === 'other' ? 'Other Participant' : speaker);
    console.log(`[AgentAssist][TRANSCRIPT] + ${displaySpeaker}: ${text}`);
    this.state.transcripts.push({ speaker: displaySpeaker, text: (text||'').trim(), timestamp: timestamp || Date.now(), isUser });
    if (this.state.currentTab === 'script') this.renderCurrentTab();
  }

  // Start capturing tab audio for other participants
  async startTabAudioCapture() {
    try {
      console.log('[AgentAssist][REMOTE] Starting other participants audio capture...');
      
      // Method 1: Use chrome.tabCapture API first (most reliable for tab audio)
      try {
        console.log('[AgentAssist][REMOTE] Trying chrome.tabCapture API for Google Meet audio...');
        const response = await chrome.runtime.sendMessage({ type: 'captureTabAudio' });
        
        if (response && response.success) {
          console.log('[AgentAssist][REMOTE] Chrome tab capture successful');
          console.log('[AgentAssist][REMOTE] Stream info:', response);
          this.setupChromeTabAudioProcessing(response);
          return;
        } else {
          console.log('[AgentAssist][REMOTE] Chrome tab capture failed:', response?.error);
        }
      } catch (chromeError) {
        console.log('[AgentAssist][REMOTE] Chrome tab capture error:', chromeError.message);
      }
      
      // Method 2: Try getDisplayMedia with specific constraints for tab sharing
      try {
        console.log('[AgentAssist][REMOTE] Requesting tab audio capture via screen sharing...');
        console.log('[AgentAssist][REMOTE] IMPORTANT: When prompted, select "Chrome Tab" for this Meet tab and enable "Share tab audio"');
        
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            mediaSource: 'browser',  // This should show browser tabs
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000
          },
          preferCurrentTab: true  // Prefer current tab
        });
        
        console.log('[AgentAssist][REMOTE] Display media capture successful');
        console.log('[AgentAssist][REMOTE] Audio tracks found:', stream.getAudioTracks().length);
        console.log('[AgentAssist][REMOTE] Video tracks found:', stream.getVideoTracks().length);
        
        if (stream.getAudioTracks().length > 0) {
          console.log('[AgentAssist][REMOTE] Got audio from display capture!');
          console.log('[AgentAssist][REMOTE] Other participants audio capture active');
          this.setupOtherParticipantAudioProcessing(stream);
          return;
        } else {
          console.log('[AgentAssist][REMOTE] No audio in display stream. User may not have selected "Share tab audio"');
          console.log('[AgentAssist][REMOTE] WARNING: No tab audio captured (likely Share tab audio unchecked). Falling back to visual detection.');
          // Keep video stream to detect visual speaking cues
          this.setupVideoBasedDetection(stream);
          // Also try enhanced visual detection
          this.setupEnhancedSpeakingDetection();
          return; // Don't try other methods since user made a choice
        }
        
      } catch (displayError) {
        console.log('[AgentAssist][REMOTE] Display media failed:', displayError.message);
        
        if (displayError.name === 'NotAllowedError') {
          console.log('[AgentAssist][REMOTE] User denied screen share.');
          console.log('[AgentAssist][REMOTE] WARNING: Screen sharing cancelled. Using visual detection.');
        } else if (displayError.name === 'NotFoundError') {
          console.log('[AgentAssist][REMOTE] No screen sharing source selected.');
          console.log('[AgentAssist][REMOTE] WARNING: No sharing source selected. Using visual detection.');
        }
      }
      
      // Method 3: Try system audio capture (Windows/macOS)
      try {
        console.log('[AgentAssist][REMOTE] Trying system audio capture...');
        
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            systemAudio: 'include'
          }
        });
        
        if (stream.getAudioTracks().length > 0) {
          console.log('[AgentAssist][REMOTE] System audio capture successful!');
          this.setupOtherParticipantAudioProcessing(stream);
          return;
        }
        
      } catch (systemError) {
        console.log('[AgentAssist][REMOTE] System audio capture failed:', systemError.message);
      }
      
      // Method 4: Try desktop capture with audio (Linux)
      try {
        console.log('[AgentAssist][REMOTE] Trying desktop capture with audio...');
        
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            mediaSource: 'screen'
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        
        if (stream.getAudioTracks().length > 0) {
          console.log('[AgentAssist][REMOTE] Desktop audio capture successful!');
          this.setupOtherParticipantAudioProcessing(stream);
          return;
        }
        
      } catch (desktopError) {
        console.log('[AgentAssist][REMOTE] Desktop audio capture failed:', desktopError.message);
      }
      
      // Method 5: Enhanced visual detection as fallback
      console.log('[AgentAssist][REMOTE] Audio capture not available. Using enhanced visual detection for other participants.');
      console.log('[AgentAssist][REMOTE] INFO: Using visual detection for other participants (no audio).');
      this.setupEnhancedSpeakingDetection();
      
    } catch (error) {
      console.error('[AgentAssist][REMOTE] Tab audio capture error:', error);
      this.setupEnhancedSpeakingDetection();
    }
  }

  // Setup chrome tab audio processing (improved)
  setupChromeTabAudioProcessing(response) {
    try {
      console.log('[AgentAssist][REMOTE] Setting up Chrome tab audio processing...');
      console.log('[AgentAssist][REMOTE] Response:', response);
      
      if (response.success && response.streamId) {
        console.log('[AgentAssist][REMOTE] Chrome successfully captured Google Meet audio');
        
        // Request the actual audio stream from background script
        chrome.runtime.sendMessage({ 
          type: 'getTabAudioStream', 
          streamId: response.streamId 
        }, (audioStream) => {
          if (audioStream && audioStream.success) {
            console.log('[AgentAssist][REMOTE] Received audio stream from background script');
            this.setupOtherParticipantAudioProcessing(audioStream.stream);
          } else {
            console.log('[AgentAssist][REMOTE] Failed to get audio stream, using visual detection');
            this.setupEnhancedSpeakingDetection();
          }
        });
        
      } else {
        console.log('[AgentAssist][REMOTE] Chrome tab capture failed, falling back to visual detection');
        this.setupEnhancedSpeakingDetection();
      }
      
    } catch (error) {
      console.error('[AgentAssist][REMOTE] Error setting up Chrome tab audio processing:', error);
      this.setupEnhancedSpeakingDetection();
    }
  }

  // Setup audio processing specifically for other participants
  async setupOtherParticipantAudioProcessing(stream) {
    try {
      console.log('[AgentAssist][REMOTE] Setting up other participants audio processing...');
      console.log('[AgentAssist][REMOTE] Stream tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })));
      
      // Check if we have audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.log('[AgentAssist][REMOTE] No audio tracks found in stream');
        this.setupEnhancedSpeakingDetection();
        return;
      }
      
      console.log('[AgentAssist][REMOTE] Audio tracks found:', audioTracks.length);
      audioTracks.forEach((track, index) => {
        console.log('[AgentAssist][REMOTE] Audio track', index, ':', {
          id: track.id,
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        });
      });
      
      // Create audio context for processing
      this.remoteAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.remoteAudioContext;
      console.log('[AgentAssist][REMOTE] Audio context created, sample rate:', ctx.sampleRate);
      
      // Create media stream source
      const source = ctx.createMediaStreamSource(stream);
      console.log('[AgentAssist][REMOTE] Media stream source created');
      
      // Load audio worklet for VAD
      try {
        await ctx.audioWorklet.addModule(chrome.runtime.getURL('audio-vad-processor.js'));
        console.log('[AgentAssist][REMOTE] Audio worklet loaded successfully');
        
        // Create VAD processor
        this.remoteAudioNode = new AudioWorkletNode(ctx, 'vad-processor', {
          processorOptions: {
            vadThreshold: 0.013,
            minMs: 300,
            maxMs: 8000,
            silenceMs: 500
          }
        });
        console.log('[AgentAssist][REMOTE] VAD processor created');
        
        // Connect audio pipeline
        source.connect(this.remoteAudioNode);
        console.log('[AgentAssist][REMOTE] Audio pipeline connected');
        
        // Handle VAD segments
        this.remoteAudioNode.port.onmessage = (event) => {
          const data = event.data;
          if (data?.type === 'segment') {
            if (!data.enough) {
              console.log('[AgentAssist][REMOTE] Speech segment too short, skipping');
              return;
            }
            console.log('[AgentAssist][REMOTE] Speech segment detected, length:', data.samples.length, 'samples');
            this.handleRemoteSegment(data.samples, data.sampleRate);
          }
        };
        
        this.remoteAudioNode.port.onmessageerror = e => {
          console.warn('[AgentAssist][REMOTE] Worklet port error', e);
        };
        
        console.log('[AgentAssist][REMOTE] Other participants audio processing pipeline ready');
        
      } catch (err) {
        console.error('[AgentAssist][REMOTE] AudioWorklet pipeline failed, fallback to legacy VAD:', err);
        this.setupEnhancedSpeakingDetection();
      }
      
    } catch (error) {
      console.error('[AgentAssist][REMOTE] Error setting up other participants audio processing:', error);
      this.setupEnhancedSpeakingDetection();
    }
  }

  handleRemoteSegment(float32, sr) {
    console.log('[AgentAssist][REMOTE] Processing remote audio segment...');
    
    if (sr !== this.TARGET_SR) {
      console.log('[AgentAssist][REMOTE] Downsampling from', sr, 'to', this.TARGET_SR);
      float32 = this.downsampleFloat32(float32, sr, this.TARGET_SR);
      sr = this.TARGET_SR;
    }
    
    // Stream remote participant audio too (if desired)
    this.sendAudioFrame(float32, sr);
  }  // Removed Azure STT remote segment sending - using WebSocket only

  // Removed WAV conversion (was for Azure STT)

  // Enhanced visual speaking detection for when audio capture fails
  setupEnhancedSpeakingDetection() {
    console.log('[AgentAssist] Setting up enhanced visual speaking detection...');
    
    // Look for Google Meet's built-in speaking indicators
    const detectSpeaking = () => {
      if (!this.isStreaming) return;
      
      try {
        // Google Meet shows speaking indicators in various ways
        const speakingSelectors = [
          // Speaking border around video
          '[data-speaking="true"]',
          '.speaking-indicator-border',
          // Audio level indicators
          '.audio-level-indicator[style*="transform"]',
          // Speaking animation on participant tiles
          '[data-participant-id][class*="speaking"]',
          // Microphone indicators
          '.participant-microphone[data-is-speaking="true"]'
        ];
        
        speakingSelectors.forEach(selector => {
          const speakingElements = document.querySelectorAll(selector);
          speakingElements.forEach(el => {
            const participantName = this.getParticipantNameFromElement(el);
            if (participantName && !participantName.includes('You') && !participantName.includes('(You)')) {
              console.log('[AgentAssist] Visual detection: Other participant speaking:', participantName);
              
              // Add a realistic response
              if (!this.lastVisualDetection || Date.now() - this.lastVisualDetection > 5000) {
                this.simulateRealisticResponse(participantName);
                this.lastVisualDetection = Date.now();
              }
            }
          });
        });
        
      } catch (error) {
        console.error('[AgentAssist] Error in visual speaking detection:', error);
      }
      
      // Continue monitoring
      setTimeout(detectSpeaking, 1000);
    };
    
    // Start visual detection
    setTimeout(detectSpeaking, 2000); // Give UI time to load
  }

  // Get participant name from a DOM element
  getParticipantNameFromElement(element) {
    // Try to find participant name in various ways
    let name = null;
    let current = element;
    
    // Search up the DOM tree for participant info
    for (let i = 0; i < 10 && current && !name; i++) {
      name = current.getAttribute('data-self-name') ||
             current.getAttribute('aria-label') ||
             current.querySelector('[data-self-name]')?.getAttribute('data-self-name');
      current = current.parentElement;
    }
    
    // Clean up the name
    if (name) {
      name = name.replace(/\s*\(You\)\s*/g, '').trim();
      // Filter out non-name text
      if (name.length < 2 || name.length > 50 || 
          name.includes('Turn on') || name.includes('More') || 
          name.includes('Share') || name.includes('Meeting')) {
        return null;
      }
    }
    
    return name;
  }

  // Disabled fake generation; now only logs indicator.
  simulateRealisticResponse(participantName) { console.log('[AgentAssist][VISUAL] Speaking indicator for', participantName); }

  // Setup video-based detection from screen sharing
  setupVideoBasedDetection(stream) {
    try {
      console.log('[AgentAssist] Setting up video-based speaking detection...');
      
      // Create video element to analyze the captured screen
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.style.display = 'none';
      document.body.appendChild(video);
      
      video.onloadedmetadata = () => {
        video.play();
        console.log('[AgentAssist] Video analysis ready for speaking detection');
        
        // Analyze video frames for speaking indicators
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const analyzeFrame = () => {
          if (!this.isStreaming || video.ended) return;
          
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            // Here you could analyze the video for visual speaking cues
            // For now, we'll rely on enhanced speaking detection
          } catch (e) {
            // Ignore canvas errors
          }
          
          requestAnimationFrame(analyzeFrame);
        };
        
        analyzeFrame();
      };
      
      // Store reference for cleanup
      this.videoAnalysisElement = video;
      
    } catch (error) {
      console.error('[AgentAssist] Error setting up video-based detection:', error);
    }
  }

  // Speech recognition for other participants (from tab audio)
  startTabSpeechRecognition(stream) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('[AgentAssist] Speech recognition not supported for tab audio');
      return;
    }
    
    try {
      console.log('[AgentAssist] Starting speech recognition for other participants...');
      
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const tabRecognition = new SpeechRecognition();
      
      // Configure for continuous recognition
      tabRecognition.continuous = true;
      tabRecognition.interimResults = true;
      tabRecognition.lang = 'en-US';
      
      // Note: We can't directly feed the stream to speech recognition
      // Speech recognition API uses the default audio input
      // This is a browser limitation
      
      tabRecognition.onstart = () => {
        console.log('[AgentAssist] Tab speech recognition started (monitoring for other participants)');
      };
      
      tabRecognition.onresult = (event) => {
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          // This would be other participants speaking
          // But since we can't distinguish, we'll add it as "Other"
          console.log('[AgentAssist] Detected speech (possibly other participant):', finalTranscript);
          this.addTranscript('other', finalTranscript);
        }
      };
      
      tabRecognition.onerror = (event) => {
        console.error('[AgentAssist] Tab speech recognition error:', event.error);
        
        // Restart recognition after a delay
        setTimeout(() => {
          if (this.isStreaming) {
            this.startTabSpeechRecognition(stream);
          }
        }, 1000);
      };
      
      tabRecognition.onend = () => {
        console.log('[AgentAssist] Tab speech recognition ended');
        
        // Restart recognition for continuous operation
        setTimeout(() => {
          if (this.isStreaming) {
            this.startTabSpeechRecognition(stream);
          }
        }, 100);
      };
      
      // Note: This is a limitation - we can't use the captured stream directly
      // The speech recognition API will use the default microphone
      // For true tab audio recognition, we'd need a more complex setup
      
      console.log('[AgentAssist] Tab speech recognition setup complete (with limitations)');
      this.tabRecognition = tabRecognition;
      
      // Don't start it automatically since it would conflict with mic recognition
      // Instead, we'll rely on visual participant monitoring
      console.log('[AgentAssist] Using visual participant monitoring instead of audio recognition to avoid conflicts');
      
    } catch (error) {
      console.error('[AgentAssist] Error starting tab speech recognition:', error);
    }
  }

  // Setup monitoring for other participants (enhanced version)
  setupParticipantMonitoring() {
    console.log('[AgentAssist] Setting up enhanced participant monitoring for other participants...');
    
    // Monitor Google Meet DOM for participant changes and speaking indicators
    this.observeParticipants();
    
    // Add visual speaking detection
    this.setupSpeakingDetection();
  }

  // Setup visual detection for when participants are speaking
  setupSpeakingDetection() {
    console.log('[AgentAssist] Setting up visual speaking detection...');
    
    // Look for visual indicators that someone is speaking in Google Meet
    const checkSpeakingIndicators = () => {
      try {
        // Google Meet shows speaking indicators - look for these
        const speakingIndicators = [
          // Speaking indicators in participant videos
          '[data-speaking="true"]',
          '.speaking-indicator',
          '[aria-label*="speaking"]',
          // Audio level indicators
          '.audio-level-indicator',
          // Video containers that show speaking
          '[data-self-name][data-speaking]'
        ];
        
        speakingIndicators.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            // Get participant name
            let participantName = this.getParticipantName(el);
            
            if (participantName && !participantName.includes('You')) {
              console.log('[AgentAssist] Detected speaking indicator for:', participantName);
              
              // Simulate transcription for other participant
              // In a real implementation, this would be actual speech-to-text
              this.simulateOtherParticipantSpeech(participantName);
            }
          });
        });
        
      } catch (error) {
        console.error('[AgentAssist] Error checking speaking indicators:', error);
      }
    };
    
    // Check for speaking indicators periodically
    if (this.isStreaming) {
      this.speakingCheckInterval = setInterval(() => {
        if (this.isStreaming) {
          checkSpeakingIndicators();
        } else {
          clearInterval(this.speakingCheckInterval);
        }
      }, 2000); // Check every 2 seconds
    }
  }

  // Get participant name from element
  getParticipantName(element) {
    // Try various ways to get the participant name
    let name = element.getAttribute('data-self-name') || 
              element.getAttribute('aria-label') ||
              element.getAttribute('title');
    
    // Look in parent elements
    if (!name) {
      let parent = element.parentElement;
      while (parent && !name) {
        name = parent.getAttribute('data-self-name') || 
              parent.getAttribute('aria-label') ||
              parent.querySelector('[data-self-name]')?.getAttribute('data-self-name');
        parent = parent.parentElement;
      }
    }
    
    // Clean up the name
    if (name) {
      name = name.replace(/\s*\(You\)\s*/g, '').trim();
      name = name.replace(/\s*speaking\s*/gi, '').trim();
    }
    
    return name;
  }

  simulateOtherParticipantSpeech(participantName) { console.log('[AgentAssist][VISUAL] Possible speech by', participantName); }

  // Observe Google Meet participants
  observeParticipants() {
    console.log('[AgentAssist] Setting up participant observation...');
    
    const checkParticipants = () => {
      try {
        const participants = new Set();
        
        // More specific selectors for ACTUAL participants only
        const participantSelectors = [
          // Main participant video containers
          '[data-participant-id]:not([data-participant-id=""])',
          // Participant name overlays in video
          '[data-self-name]:not([data-self-name=""])',
          // People panel participant list
          '[role="listitem"][data-participant-id]',
          // Specific participant containers
          '.participant-container [data-self-name]'
        ];
        
        participantSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            let name = el.getAttribute('data-self-name') || 
                      el.getAttribute('data-participant-id') ||
                      el.textContent?.trim();
            
            // Very strict filtering for actual participant names
            if (name && 
                name.length > 2 && 
                name.length < 100 && 
                // Exclude UI elements
                !name.includes('Turn on') &&
                !name.includes('Share') &&
                !name.includes('More') &&
                !name.includes('Chat') &&
                !name.includes('Meeting') &&
                !name.includes('Host') &&
                !name.includes('Participants') &&
                !name.includes('actions') &&
                !name.includes('settings') &&
                !name.includes('captions') &&
                !name.includes('Gemini') &&
                !name.includes('notes') &&
                !name.includes('Reframe') &&
                !name.includes('panel') &&
                !name.includes('controls') &&
                !name.includes('microphone') &&
                !name.includes('camera') &&
                !name.includes('video') &&
                !name.includes('audio') &&
                !name.includes('screen') &&
                !name.includes('reaction') &&
                !name.includes('hand') &&
                !name.includes('phone') &&
                !name.includes('Call') &&
                !name.includes('domain_disabled') &&
                !name.includes('more_vert') &&
                !name.includes('devices') &&
                !name.match(/^\s*[–\-\+\*]\s*/) && // Not bullet points
                !name.match(/^\d+\s*(joined|people)/) && // Not "2 joined"
                // Only keep names that look like actual people
                /^[A-Za-z\s\-\.\']+(\s*\([^)]+\))?$/.test(name)) {
              
              // Clean up the name
              name = name.replace(/\s*\(You\)\s*/g, ' (You)').trim();
              participants.add(name);
            }
          });
        });
        
        // Convert to array and log only actual participants
        const participantArray = Array.from(participants);
        if (participantArray.length > 0 && participantArray.length < 20) { // Reasonable number
          console.log('[AgentAssist] Actual participants detected:', participantArray);
        }
        
      } catch (error) {
        console.error('[AgentAssist] Error checking participants:', error);
      }
    };
    
    // Check participants periodically
    if (this.isStreaming) {
      checkParticipants();
      this.participantCheckInterval = setInterval(() => {
        if (this.isStreaming) {
          checkParticipants();
        } else {
          clearInterval(this.participantCheckInterval);
        }
      }, 5000); // Check every 5 seconds
    }
  }

  // Clean up tab audio resources
  cleanupTabAudio() {
    // Clean up other participant audio processing
    if (this.otherAudioStream) {
      this.otherAudioStream.getTracks().forEach(track => track.stop());
      this.otherAudioStream = null;
    }
    
    if (this.otherAudioContext) {
      this.otherAudioContext.close();
      this.otherAudioContext = null;
    }
    
    if (this.otherAudioAnalyser) {
      this.otherAudioAnalyser = null;
    }
    
    // Clean up legacy tab audio processing
    if (this.tabAudioStream) {
      this.tabAudioStream.getTracks().forEach(track => track.stop());
      this.tabAudioStream = null;
    }
    
    if (this.tabAudioProcessor) {
      this.tabAudioProcessor.disconnect();
      this.tabAudioProcessor = null;
    }
    
    if (this.tabAudioContext) {
      this.tabAudioContext.close();
      this.tabAudioContext = null;
    }
    
    if (this.tabRecognition) {
      this.tabRecognition.stop();
      this.tabRecognition = null;
    }
    
    if (this.participantCheckInterval) {
      clearInterval(this.participantCheckInterval);
      this.participantCheckInterval = null;
    }
    
    if (this.speakingCheckInterval) {
      clearInterval(this.speakingCheckInterval);
      this.speakingCheckInterval = null;
    }

  if (this.remoteAudioProcessor) { try { this.remoteAudioProcessor.disconnect(); } catch(e){} this.remoteAudioProcessor = null; }
  if (this.remoteAudioContext) { try { this.remoteAudioContext.close(); } catch(e){} this.remoteAudioContext = null; }
  if (this.remoteAudioNode) { try { this.remoteAudioNode.disconnect(); this.remoteAudioNode.port.close(); } catch(e){} this.remoteAudioNode = null; }
    
    console.log('[AgentAssist] All audio resources cleaned up');
  }

  // Configure remote STT endpoint + key - REMOVED (Azure functionality)
  // Using WebSocket audio streaming only
  
  // Removed Azure STT configuration functions
  // configureAzureStt() and setRemoteSttConfig() are no longer needed

  setupDraggable() {
    if (!this.sidebar) return;
    const dragHandle = this.sidebar.querySelector('.agent-assist-drag-handle');
    if (!dragHandle) return;
    
    let isDragging = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startSidebarX = 0;
    let startSidebarY = 0;

    const onDragStart = (e) => {
        // Only drag from handle - prevent dragging from buttons
        if (!e.target.closest('.agent-assist-drag-handle')) return;
        if (e.target.closest('.minimize-toggle, .mic-toggle, .agent-assist-tab, button')) return;
        
        // Don't start drag if clicking on interactive elements
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        // Get starting positions
        const rect = this.sidebar.getBoundingClientRect();
        startSidebarX = rect.left;
        startSidebarY = rect.top;
        
        if (e.type === 'touchstart') {
            startMouseX = e.touches[0].clientX;
            startMouseY = e.touches[0].clientY;
        } else {
            startMouseX = e.clientX;
            startMouseY = e.clientY;
        }
        
        isDragging = true;
        
        // Prepare for dragging
        this.sidebar.classList.add('dragging');
        this.sidebar.style.position = 'fixed';
        this.sidebar.style.zIndex = '999999';
        this.sidebar.style.left = startSidebarX + 'px';
        this.sidebar.style.top = startSidebarY + 'px';
        this.sidebar.style.right = 'unset';
        this.sidebar.style.transform = 'none';
        
        // Disable any layout interference
        this.removeLayoutPush();
        
        console.log('[DRAG] Started at:', { startSidebarX, startSidebarY });
    };

    const onDragMove = (e) => {
        if (!isDragging) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        let currentMouseX, currentMouseY;
        if (e.type === 'touchmove') {
            currentMouseX = e.touches[0].clientX;
            currentMouseY = e.touches[0].clientY;
        } else {
            currentMouseX = e.clientX;
            currentMouseY = e.clientY;
        }
        
        // Calculate movement delta
        const deltaX = currentMouseX - startMouseX;
        const deltaY = currentMouseY - startMouseY;
        
        // Calculate new position
        let newX = startSidebarX + deltaX;
        let newY = startSidebarY + deltaY;
        
        // Get sidebar dimensions for boundary checking
        const sidebarRect = this.sidebar.getBoundingClientRect();
        const sidebarWidth = sidebarRect.width;
        const sidebarHeight = sidebarRect.height;
        
        // Apply viewport boundaries with padding
        const padding = 10;
        const minX = padding;
        const minY = padding;
        const maxX = window.innerWidth - sidebarWidth - padding;
        const maxY = window.innerHeight - sidebarHeight - padding;
        
        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(minY, Math.min(maxY, newY));
        
        // Apply new position
        this.sidebar.style.left = newX + 'px';
        this.sidebar.style.top = newY + 'px';
    };

    const onDragEnd = (e) => {
        if (!isDragging) return;
        
        isDragging = false;
        this.sidebar.classList.remove('dragging');
        
        // Mark as user-positioned
        this.sidebar.setAttribute('data-user-positioned', 'true');
        
        const finalPosition = {
            left: this.sidebar.style.left,
            top: this.sidebar.style.top
        };
        
        console.log('[DRAG] Ended at:', finalPosition);
        
        // Force buttons to be visible and clickable after drag
        const minimizeToggle = this.sidebar.querySelector('.minimize-toggle');
        const micToggle = this.sidebar.querySelector('.mic-toggle');
        
        if (minimizeToggle) {
            minimizeToggle.style.pointerEvents = 'auto';
            minimizeToggle.style.zIndex = '1000000';
            minimizeToggle.style.position = 'relative';
        }
        
        if (micToggle) {
            micToggle.style.pointerEvents = 'auto';
            micToggle.style.zIndex = '1000000';
            micToggle.style.position = 'relative';
        }
        
        // Ensure all event handlers still work after drag
        this.rebindEventHandlers();
        
        // Add a small delay to check if position gets overridden
        setTimeout(() => {
            const afterDelay = {
                left: this.sidebar.style.left,
                top: this.sidebar.style.top
            };
            console.log('[DRAG] Position after 100ms:', afterDelay);
            
            if (finalPosition.top !== afterDelay.top || finalPosition.left !== afterDelay.left) {
                console.error('[DRAG] Position was overridden!', { 
                    before: finalPosition, 
                    after: afterDelay 
                });
            }
            
            // Re-apply button styles just to be sure
            if (minimizeToggle) {
                minimizeToggle.style.pointerEvents = 'auto';
                minimizeToggle.style.zIndex = '1000000';
            }
        }, 100);
    };

    // Event listeners
    dragHandle.addEventListener('mousedown', onDragStart);
    dragHandle.addEventListener('touchstart', onDragStart, { passive: false });
    
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchend', onDragEnd);
    
    // Prevent context menu on drag handle
    dragHandle.addEventListener('contextmenu', e => e.preventDefault());
}

  getTabHTML(tab) {
    const s = this.state;
    switch (tab) {
      case 'assist':
        /*if (!s.suggestions.length) return `<div style="display: flex; flex-direction: column; align-items: center; padding: 0px; gap: 16px; position: absolute; width: 206px; height: 98px; left: calc(50% - 206px/2 + 0.5px); top: calc(50% - 98px/2);">
          <div style="box-sizing: border-box; width: 40px; height: 40px; position: relative; flex: none; order: 0; flex-grow: 0;">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="position: absolute; left: 0; top: 0;">
              <path d="M4 0.5H36C37.933 0.5 39.5 2.067 39.5 4V36C39.5 37.933 37.933 39.5 36 39.5H4C2.067 39.5 0.5 37.933 0.5 36V4C0.5 2.067 2.067 0.5 4 0.5Z" stroke="#F1F1F1"/>
              <path d="M20 16.6663V13.333H16.666" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M25 16.667H15C14.0795 16.667 13.333 17.4132 13.333 18.3337V25.0003C13.333 25.9208 14.0795 26.667 15 26.667H25C25.9205 26.667 26.667 25.9208 26.667 25.0003V18.3337C26.667 17.4132 25.9205 16.667 25 16.667Z" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M11.666 21.667H13.333" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M26.666 21.667H28.333" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M22.5 20.833V22.4997" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M17.5 20.833V22.4997" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; padding: 0px; gap: 8px; width: 206px; height: 42px; flex: none; order: 1; flex-grow: 0;">
            <div style="width: 140px; height: 18px; font-family: 'SF Pro Text'; font-style: normal; font-weight: 500; font-size: 14px; line-height: 18px; text-align: center; color: #2E2D2F; flex: none; order: 0; flex-grow: 0;">Displaying Nudges...</div>
            <div style="width: 206px; height: 16px; font-family: 'SF Pro Text'; font-style: normal; font-weight: 500; font-size: 12px; line-height: 16px; text-align: center; color: #646466; flex: none; order: 1; flex-grow: 0;">Please wait until the nudges appear</div>
          </div>
        </div>`;
        return `<div class="aa-suggestions">` + s.suggestions.slice().reverse().map((obj,i) => {
          const item = typeof obj === 'string' ? { text: obj } : obj;
          const barClass = item.bar==='green' ? ' bar-green' : '';
          return `<div class="aa-suggestion${barClass}" data-idx="${i}">${this.escapeHTML(item.text)}</div>`;
        }).join('') + '</div>';
        */
        if (!s.suggestions.length) return this.emptyState('💡','Ready to Assist','AI suggestions will appear here.');
        return `<div class="aa-suggestions">` + 
          s.suggestions.slice().reverse().map(item => {
            // If item is already an HTML string (contains HTML tags), use it directly
            // Otherwise wrap it in aa-suggestion div
            if (typeof item === 'string' && item.includes('<div class="aa-suggestion')) {
              return item;
            } else {
              return `<div class="aa-suggestion">${typeof item === 'string' ? item : this.escapeHTML(item.text)}</div>`;
            }
          }).join('') +
        `</div>`;
        
      case 'script':
         if (!s.transcripts.length) 
            return `<div style="display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0px; gap: 16px; position: absolute; width: 229px; height: 98px; left: calc(50% - 229px/2 + 0.5px); top: calc(50% - 98px/2);">
              <div style="box-sizing: border-box; width: 40px; height: 40px; position: relative; flex: none; order: 0; flex-grow: 0;">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="position: absolute; left: 0; top: 0;">
                  <path d="M4 0.5H36C37.933 0.5 39.5 2.067 39.5 4V36C39.5 37.933 37.933 39.5 36 39.5H4C2.067 39.5 0.5 37.933 0.5 36V4C0.5 2.067 2.067 0.5 4 0.5Z" stroke="#F1F1F1"/>
                  <path d="M26.334 24.1667V14.1667C26.334 13.7246 26.158 13.3007 25.846 12.9882C25.533 12.6756 25.109 12.5 24.667 12.5H13.834" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M17.166 27.5H27.166C27.608 27.5 28.032 27.3244 28.345 27.0118C28.657 26.6993 28.833 26.2754 28.833 25.8333V25C28.833 24.779 28.745 24.567 28.589 24.4107C28.432 24.2545 28.22 24.1667 27.999 24.1667H19.666C19.445 24.1667 19.233 24.2545 19.077 24.4107C18.92 24.567 18.833 24.779 18.833 25V25.8333C18.833 26.2754 18.657 26.6993 18.345 27.0118C18.032 27.3244 17.608 27.5 17.166 27.5ZM17.166 27.5C16.724 27.5 16.3 27.3244 15.988 27.0118C15.675 26.6993 15.499 26.2754 15.499 25.8333V14.1667C15.499 13.7246 15.324 13.3007 15.011 12.9882C14.699 12.6756 14.275 12.5 13.833 12.5C13.391 12.5 12.967 12.6756 12.654 12.9882C12.342 13.3007 12.166 13.7246 12.166 14.1667V15.8333C12.166 16.0543 12.254 16.2663 12.41 16.4226C12.566 16.5789 12.778 16.6667 12.999 16.6667H15.499" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div style="display: flex; flex-direction: column; align-items: center; padding: 0px; gap: 8px; width: 229px; height: 42px; flex: none; order: 1; align-self: stretch; flex-grow: 0;">
                <div style="width: 128px; height: 18px; font-family: 'SF Pro Text'; font-style: normal; font-weight: 500; font-size: 14px; line-height: 18px; text-align: center; color: #2E2D2F; flex: none; order: 0; flex-grow: 0;">Displaying Script...</div>
                <div style="width: 229px; height: 16px; font-family: 'SF Pro Text'; font-style: normal; font-weight: 500; font-size: 12px; line-height: 16px; text-align: center; color: #646466; flex: none; order: 1; flex-grow: 0;">Please wait until the script appeared</div>
              </div>
            </div>`;
          
          //const aggregated = s.transcripts.map(t => t.text).join(' ');
          const entries = s.transcripts.slice().reverse().map(t => {
            // Determine if it's user's own transcript or someone else's
            const isUser = t.speaker != 'Agent';
            const alignmentClass = isUser ? 'user' : 'agent';
            return `<div class="aa-transcript-entry ${alignmentClass}">
                      <div class="aa-transcript-speaker">${this.escapeHTML(t.speaker)}</div>
                      <div class="aa-transcript-text">${this.escapeHTML(t.text)}</div>
                      <div class="aa-transcript-time">${new Date(t.timestamp).toLocaleTimeString()}</div>
                    </div>`;
          }).join('');
          return entries;
      case 'score':
        if (!s.transcripts.length) 
          return `<div style="display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0px; gap: 16px; position: absolute; width: 231px; height: 98px; left: calc(50% - 231px/2 + 0.5px); top: calc(50% - 98px/2);">
                    <div style="box-sizing: border-box; width: 40px; height: 40px; border: 1px solid #F1F1F1; border-radius: 4px; flex: none; order: 0; flex-grow: 0; position: relative; display: flex; align-items: center; justify-content: center;">
                      <svg width="21" height="20" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10.5 13.334V17.5007" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M13.834 11.666V17.4993" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M17.166 8.33398V17.5007" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M18.8327 2.5L11.6277 9.705C11.589 9.7438 11.543 9.77459 11.4924 9.79559C11.4418 9.8166 11.3875 9.82741 11.3327 9.82741C11.2779 9.82741 11.2236 9.8166 11.173 9.79559C11.1224 9.77459 11.0764 9.7438 11.0377 9.705L8.29435 6.96167C8.21621 6.88355 8.11025 6.83967 7.99977 6.83967C7.88928 6.83967 7.78332 6.88355 7.70518 6.96167L2.16602 12.5" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M3.83398 15V17.5" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M7.16602 11.666V17.4993" stroke="#565ADD" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; padding: 0px; gap: 8px; width: 231px; height: 42px; flex: none; order: 1; flex-grow: 0;">
                      <div style="width: 231px; height: 18px; font-family: 'SF Pro Text'; font-style: normal; font-weight: 500; font-size: 14px; line-height: 18px; text-align: center; color: #2E2D2F; flex: none; order: 0; align-self: stretch; flex-grow: 0;">Displaying Score...</div>
                      <div style="width: 231px; height: 16px; font-family: 'SF Pro Text'; font-style: normal; font-weight: 500; font-size: 12px; line-height: 16px; text-align: center; color: #646466; flex: none; order: 1; flex-grow: 0;">Please wait until the score is generated.</div>
                    </div>
                  </div>`;
        
        // Show key metrics container when scores are available
        return `<div class="aa-score-metrics-container">
                  <!-- First metric box - Score -->
                  <div class="aa-score-metric-box">
                    <div class="aa-metric-label-row">
                      <div class="aa-metric-icon">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M7 9.334V12.2507" stroke="#646466" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M9.334 8.166V12.2493" stroke="#646466" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M11.666 5.834V12.2507" stroke="#646466" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M12.8327 1.75L7.78925 6.7935C7.76211 6.8207 7.72989 6.84218 7.69447 6.85694C7.65906 6.87171 7.62104 6.87948 7.58268 6.87948C7.54433 6.87948 7.50631 6.87171 7.47089 6.85694C7.43548 6.84218 7.40326 6.8207 7.37611 6.7935L5.45577 4.87317C5.40116 4.81855 5.32695 4.78776 5.24959 4.78776C5.17223 4.78776 5.09802 4.81855 5.04341 4.87317L1.16602 8.75" stroke="#646466" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M2.334 10.5V12.25" stroke="#646466" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M4.666 8.166V12.2493" stroke="#646466" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </div>
                      <div class="aa-metric-label">Score</div>
                    </div>
                    <div class="aa-metric-value">${this.totalScore}</div>
                  </div>
                  
                  <!-- Second metric box - Categories covered -->
                  <div class="aa-score-metric-box">
                    <div class="aa-metric-label-row">
                      <div class="aa-metric-icon">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M11.666 12.6667C11.975 12.6667 12.272 12.5437 12.491 12.325C12.71 12.1062 12.833 11.8094 12.833 11.5V5.66667C12.833 5.35725 12.71 5.0605 12.491 4.84171C12.272 4.62292 11.975 4.5 11.666 4.5H7.05768C6.86257 4.50191 6.67008 4.45486 6.49786 4.36314C6.32563 4.27142 6.17916 4.13797 6.07185 3.975L5.59935 3.275C5.49312 3.11369 5.3485 2.98128 5.17847 2.88965C5.00845 2.79802 4.81833 2.75003 4.62518 2.75H2.33268C2.02326 2.75 1.72652 2.87292 1.50772 3.09171C1.28893 3.3105 1.16602 3.60725 1.16602 3.91667V11.5C1.16602 11.8094 1.28893 12.1062 1.50772 12.325C1.72652 12.5437 2.02326 12.6667 2.33268 12.6667H11.666Z" stroke="#646466" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M5.25 8.58268L6.41667 9.74935L8.75 7.41602" stroke="#646466" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </div>
                      <div class="aa-metric-label">Categories covered</div>
                    </div>
                    <div class="aa-metric-value">6/8</div>
                  </div>
                </div>`;
      case 'history':
        if (!s.history.length) return this.emptyState('📚','History Empty','Past meeting summaries will appear here.');
        return s.history.slice().reverse().map(h => `<div class="aa-history-item"><div class="aa-history-date">${new Date(h.timestamp).toLocaleString()}</div><div class="aa-history-title">${h.title}</div><div class="aa-history-participants">${h.participants||''}</div></div>`).join('');
      case 'coach':
        return this.getCoachTabHTML();
      default:
        return this.emptyState('ℹ️','Unavailable','Content not available.');
    }
  }

  emptyState(icon, title, desc) {
    return `<div class="aa-empty"><div class="aa-empty-icon">${icon}</div><div class="aa-empty-title">${title}</div><div class="aa-empty-desc">${desc}</div></div>`;
  }

  switchTab(tab) {
    if (!this.sidebar) return;
    this.state.currentTab = tab;
    const tabs = [...this.sidebar.querySelectorAll('.agent-assist-tab')];
    tabs.forEach(btn => {
      const active = btn.dataset.tab === tab;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
    this.renderCurrentTab();
    this.moveUnderline();
  }

  toggle() {
    console.log('[AgentAssist][TOGGLE] Toggle called, current state:', this.state.visible);
    console.log('[AgentAssist][TOGGLE] Sidebar element exists:', !!this.sidebar);
    if (this.sidebar) {
      console.log('[AgentAssist][TOGGLE] Sidebar classes:', this.sidebar.className);
      console.log('[AgentAssist][TOGGLE] Sidebar transform:', this.sidebar.style.transform);
      console.log('[AgentAssist][TOGGLE] Sidebar opacity:', this.sidebar.style.opacity);
    }
    
    this.state.visible ? this.hide() : this.show();
    
    // Add a small delay to check final state
    setTimeout(() => {
      console.log('[AgentAssist][TOGGLE] After toggle - state:', this.state.visible);
      if (this.sidebar) {
        console.log('[AgentAssist][TOGGLE] After toggle - classes:', this.sidebar.className);
        console.log('[AgentAssist][TOGGLE] After toggle - transform:', this.sidebar.style.transform);
        console.log('[AgentAssist][TOGGLE] After toggle - opacity:', this.sidebar.style.opacity);
      }
    }, 100);
  }

  resetPosition() {
    if (!this.sidebar) return;
    
    console.log('[POSITION] Resetting sidebar to default position');
    
    // Clear user positioning
    this.sidebar.removeAttribute('data-user-positioned');
    
    // Reset to default CSS positioning
    this.sidebar.style.position = 'fixed';
    this.sidebar.style.right = '1.25rem';
    this.sidebar.style.top = '1.25rem';
    this.sidebar.style.left = 'unset';
    this.sidebar.style.transform = '';
    
    // Re-enable layout push if visible
    if (this.state.visible) {
      this.applyLayoutPush();
    }
  }

show() {
    if (!this.sidebar) return;
    console.log('[AgentAssist][SHOW] Showing sidebar');
    
    this.state.visible = true;
    this.sidebar.classList.add('is-visible');
    
    // Check if we have a saved position from previous minimization
    if (this._savedUserPosition) {
        console.log('[AgentAssist][SHOW] Restoring saved position:', this._savedUserPosition);
        this.sidebar.style.position = this._savedUserPosition.position || 'fixed';
        this.sidebar.style.left = this._savedUserPosition.left;
        this.sidebar.style.top = this._savedUserPosition.top;
        this.sidebar.style.right = 'unset';
        this.sidebar.style.transform = 'none';
        
        // Mark as user-positioned
        this.sidebar.setAttribute('data-user-positioned', 'true');
        
        // After restoring, clear saved position
        this._savedUserPosition = null;
    }
    // Check if user has manually positioned the sidebar
    else if (this.sidebar.hasAttribute('data-user-positioned')) {
        console.log('[AgentAssist][SHOW] Keeping user-positioned location');
        // Clear any hiding transform for user-positioned sidebars
        this.sidebar.style.transform = 'none';
    } 
    else {
        // Use default positioning - allow extension to overlap the toggle button
        console.log('[AgentAssist][SHOW] Using default positioning');
        this.sidebar.style.position = 'fixed';
        this.sidebar.style.right = '1.25rem'; // Returned to original position
        this.sidebar.style.top = '1.25rem';
        this.sidebar.style.left = 'unset';
        this.sidebar.style.transform = 'translateX(0)'; // Explicitly show
        this.reposition();
        this.applyLayoutPush();
    }
    
    // Make sure button event handlers are working
    this.rebindEventHandlers();
    
    // Ensure toggle button stays visible even when sidebar is showing
    if (this.toggleButton) {
        this.toggleButton.style.display = 'flex';
        this.toggleButton.style.opacity = '1';
    }
    
    this.updateToggleVisual();
    this.moveUnderline();
    
    // Ensure sidebar is visible
    this.sidebar.style.opacity = '1';
    this.sidebar.style.pointerEvents = 'auto';
    
    console.log('[AgentAssist][SHOW] Sidebar shown and visible');
}  

hide() { 
    if (!this.sidebar) return; 
    console.log('[AgentAssist][HIDE] Hiding sidebar');
    
    this.state.visible = false; 
    this.sidebar.classList.remove('is-visible'); 
    
    // Force hide with transform for user-positioned sidebars
    if (this.sidebar.hasAttribute('data-user-positioned')) {
        this.sidebar.style.transform = 'translateX(calc(100% + 2rem))';
    }
    
    // Ensure it's actually hidden
    this.sidebar.style.opacity = '0';
    this.sidebar.style.pointerEvents = 'none';
    
    this.removeLayoutPush();
    
    // Ensure toggle button is visible
    this.ensureToggleButton();
    if (this.toggleButton) {
        this.toggleButton.style.display = 'flex';
        this.toggleButton.style.opacity = '1';
        this.toggleButton.style.zIndex = '999997'; // Maintain z-index
    }
    
    this.updateToggleVisual(); 
    
    console.log('[AgentAssist][HIDE] Sidebar hidden');
}
  updateToggleVisual() { 
    if (!this.toggleButton) return; 
    
    // Update button visual state
    this.toggleButton.classList.toggle('active', this.state.visible); 
    this.toggleButton.setAttribute('aria-pressed', this.state.visible ? 'true' : 'false');
    
    // Always keep button visible
    this.toggleButton.style.display = 'flex';
    this.toggleButton.style.opacity = '1';
    this.toggleButton.style.zIndex = '999998';
  }

  detectHeaderHeight() { return 0; } // Force flush to top
  reposition() {
    if (!this.sidebar) return;
    
    // Don't reposition if user has manually positioned the sidebar
    if (this.sidebar.hasAttribute('data-user-positioned')) {
      return;
    }
    
    if (this.headerHeight !== 0 || this.sidebar.style.top !== '0px') {
      this.headerHeight = 0;
      this.sidebar.style.top = '0px';
      this.sidebar.style.height = '100vh';
    }
  }

  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'suggestion': this.addSuggestion(data.content); break;
      case 'transcript': this.addTranscript(data.speaker, data.text, data.timestamp); break;
      case 'score': this.updateScore(data.score, data.feedback); break;
      case 'coaching': this.addCoachingTip(data.category, data.title, data.content); break;
      default: break;
    }
  }

  addSuggestion(content) { this.state.suggestions.push(content); if (this.state.currentTab==='assist') this.renderCurrentTab(); }
  // (Note) addTranscript earlier in class handles filtering; do not redefine here.
  updateScore(score, feedback) { this.state.scores.push({ score, feedback, timestamp: Date.now(), badge: score>=80?'Positive':'Neutral' }); if (this.state.currentTab==='score') this.renderCurrentTab(); }
  addCoachingTip(category, title, content) { this.state.coaching.push({ category, title, content, timestamp: Date.now() }); if (this.state.currentTab==='coach') this.renderCurrentTab(); }
  addChatMessage(role, text) { this.state.coachChat.push({ role, text, ts: Date.now() }); if (this.state.currentTab==='coach') this.renderCurrentTab(); }
  getCoachTabHTML() {
    return `<div class="aa-coach-new-layout">
      <!-- Coach intro message container -->
      <div class="aa-coach-intro-container">
        <!-- Coach icon container -->
        <div class="aa-coach-icon-container">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8.0004 5.33268V4.26602H5.33374" stroke="#565ADD" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9.99935 5.334H4.79935C4.15631 5.334 3.66602 5.82428 3.66602 6.46732V9.00065C3.66602 9.64369 4.15631 10.134 4.79935 10.134H9.99935C10.6424 10.134 11.1327 9.64369 11.1327 9.00065V6.46732C11.1327 5.82428 10.6424 5.334 9.99935 5.334Z" stroke="#565ADD" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3.33398 7.334H4.66732" stroke="#565ADD" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M11.334 7.334H12.6673" stroke="#565ADD" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9 6.666V7.9993" stroke="#565ADD" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 6.666V7.9993" stroke="#565ADD" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        
        <!-- Coach intro message -->
        <div class="aa-coach-intro-message">
          <p>Hi, I'm your AI Coach — here to guide you, just ask me anything!</p>
        </div>
      </div>
      
      <!-- Bottom section -->
      <div class="aa-coach-bottom-section">
        <!-- Search bar -->
        <div class="aa-coach-search-bar">
          <span class="aa-coach-search-placeholder">Ask Anything</span>
          <!-- Action button for search -->
          <div class="aa-coach-search-button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.3913 12.4577C11.4174 12.5208 11.4608 12.5747 11.5173 12.6121C11.5739 12.6494 11.6414 12.6685 11.7093 12.6668C11.7772 12.665 11.8434 12.6426 11.8978 12.6023C11.9522 12.5621 11.9925 12.506 12.0156 12.4417L16.3489 -0.225C16.3712 -0.284 16.3755 -0.348 16.3612 -0.4093C16.3469 -0.4706 16.3156 -0.5267 16.2716 -0.5711C16.2276 -0.6155 16.1729 -0.6464 16.1125 -0.66C16.0521 -0.6737 15.9881 -0.6696 15.9289 -0.6483L3.26226 3.685C3.19856 3.7071 3.14269 3.7483 3.10225 3.8031C3.0618 3.858 3.03892 3.9238 3.03692 3.9918C3.03492 4.0598 3.05392 4.1267 3.09158 4.1835C3.12923 4.2403 3.18363 4.2844 3.24693 4.3097L8.5336 6.4297C8.70026 6.4966 8.85193 6.5967 8.97893 6.7238C9.10593 6.851 9.20626 7.0027 9.27359 7.1697L11.3913 12.4577Z" stroke="#565ADD" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16.2692 -0.5684L8.97559 6.7243" stroke="#565ADD" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    </div>`;
  }
  escapeHTML(str){ return String(str).replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s])); }
  renderCurrentTab() {
    if (!this.sidebar) return; const container = this.sidebar.querySelector('.agent-assist-content'); if (!container) return;
    container.classList.toggle('aa-coach-mode', this.state.currentTab==='coach');
    container.innerHTML = this.getTabHTML(this.state.currentTab);
    if (this.state.currentTab==='coach') this.bindChatEvents();
  }
  bindChatEvents(){
    const form = this.sidebar.querySelector('#aa-chat-form');
    if(!form) return;
    form.addEventListener('submit', e=>{ e.preventDefault(); const input = form.querySelector('#aa-chat-input'); if(!input||!input.value.trim()) return; const text = input.value.trim(); input.value=''; this.addChatMessage('user', text); this.fakeAssistantReply(text); });
    // Auto scroll
    setTimeout(()=>{ const msgC = this.sidebar.querySelector('#aa-chat-messages'); if(msgC) msgC.scrollTop = msgC.scrollHeight; }, 30);
  }
  fakeAssistantReply(userText){
    // Simple placeholder until backend integration
    const reply = "Thanks! I'll analyze: " + userText.slice(0,140);
    setTimeout(()=>{ this.addChatMessage('assistant', reply); const msgC = this.sidebar.querySelector('#aa-chat-messages'); if(msgC) msgC.scrollTop = msgC.scrollHeight; }, 600);
  }
  moveUnderline() { if(!this.sidebar||!this.underlineEl) return; const active = this.sidebar.querySelector('.agent-assist-tab[aria-selected="true"]'); if(!active){ this.underlineEl.style.width='0'; return;} const rect = active.getBoundingClientRect(); const parentRect = active.parentElement.getBoundingClientRect(); this.underlineEl.style.width = rect.width + 'px'; this.underlineEl.style.transform = `translateX(${rect.left - parentRect.left}px)`; }

  sendContextUpdate() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      const context = { action: 'context', participants: this.getParticipants(), meetingId: this.getMeetingId(), timestamp: Date.now() };
      this.websocket.send(JSON.stringify(context));
      console.log('[AgentAssist][CTX] Sent context update');
    }
  }

  scheduleContextUpdates() { if (this.contextInterval) clearInterval(this.contextInterval); this.contextInterval = setInterval(()=>this.sendContextUpdate(), 30000); }

  // Get participants from meeting (completely redesigned)
  getParticipants() {
    console.log('[AgentAssist][PARTICIPANTS] Starting participant detection...');
    const participants = new Set(); // Use Set to avoid duplicates
    
    // Method 1: Primary selector from user's HTML (.notranslate)
    this.extractParticipantsFromSelector('.notranslate', participants, 'notranslate spans');
    
    // Method 2: Research-based selector from user
    this.extractParticipantsFromSelector('.VfPpkd-Bz112c-LgbsSe.yHy1rc.eT1y3b-fm3gLc.r4bT5e', participants, 'research selector');
    
    // Method 3: Google Meet participant containers
    this.extractParticipantsFromContainers(participants);
    
    // Method 4: Fallback selectors
    const fallbackSelectors = [
      '[data-self-name]',
      '.zWGUib', // Meet participant name
      '.KjZzFe', // Another participant selector
      '[aria-label*="participant"]',
      '.XEazBc [jsslot] div span',
      '[data-participant-id] span'
    ];
    
    fallbackSelectors.forEach(selector => {
      this.extractParticipantsFromSelector(selector, participants, `fallback: ${selector}`);
    });
    
    // Convert Set to Array and filter
    const participantList = Array.from(participants).filter(name => 
      this.isValidParticipantName(name)
    );
    
    console.log('[AgentAssist][PARTICIPANTS] Final participant list:', participantList);
    return participantList;
  }

  // Extract participants from a specific selector
  extractParticipantsFromSelector(selector, participantSet, sourceType) {
    try {
      const elements = document.querySelectorAll(selector);
      console.log(`[AgentAssist][PARTICIPANTS] Checking ${sourceType}: found ${elements.length} elements`);
      
      elements.forEach((element, index) => {
        // Try different ways to get the name
        const nameOptions = [
          element.textContent?.trim(),
          element.getAttribute('data-self-name'),
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.getAttribute('alt')
        ];
        
        nameOptions.forEach(name => {
          if (name && this.isValidParticipantName(name)) {
            const cleanedName = this.cleanParticipantName(name);
            if (cleanedName) {
              participantSet.add(cleanedName);
              console.log(`[AgentAssist][PARTICIPANTS] Added from ${sourceType}:`, cleanedName);
            }
          }
        });
      });
    } catch (error) {
      console.warn(`[AgentAssist][PARTICIPANTS] Error with ${sourceType}:`, error);
    }
  }

  // Extract participants from Google Meet specific containers
  extractParticipantsFromContainers(participantSet) {
    try {
      // Look for participant containers/cards
      const containerSelectors = [
        '.XEazBc', // Main participant container
        '[data-participant-id]', // Participant with ID
        '.participant-item', // Generic participant item
        '.VfPpkd-Bz112c' // Material button containers
      ];
      
      containerSelectors.forEach(containerSelector => {
        const containers = document.querySelectorAll(containerSelector);
        console.log(`[AgentAssist][PARTICIPANTS] Checking containers ${containerSelector}: ${containers.length} found`);
        
        containers.forEach(container => {
          // Look for text content within containers
          const textElements = container.querySelectorAll('span, div, [data-self-name]');
          textElements.forEach(textEl => {
            const name = textEl.textContent?.trim() || textEl.getAttribute('data-self-name');
            if (name && this.isValidParticipantName(name)) {
              const cleanedName = this.cleanParticipantName(name);
              if (cleanedName) {
                participantSet.add(cleanedName);
                console.log('[AgentAssist][PARTICIPANTS] Added from container:', cleanedName);
              }
            }
          });
        });
      });
    } catch (error) {
      console.warn('[AgentAssist][PARTICIPANTS] Error extracting from containers:', error);
    }
  }

  // Check if a name is valid for a participant
  isValidParticipantName(name) {
    if (!name || typeof name !== 'string') return false;
    
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) return false;
    
    // Filter out UI text and non-names
    const invalidPatterns = [
      /^(turn on|turn off|more|share|meeting|chat|google|enable|disable)/i,
      /^(mute|unmute|camera|microphone|mic|video)/i,
      /^(join|leave|end|start|settings|options)/i,
      /^(participants|people|attendees|members)/i,
      /^[0-9\s\-\+\(\)]+$/, // Only numbers/symbols
      /^[a-z]{1,3}$/, // Very short abbreviations
      /google\.com|meet\.google/i // Emails/URLs
    ];
    
    return !invalidPatterns.some(pattern => pattern.test(trimmed));
  }

  // Clean and normalize participant name
  cleanParticipantName(name) {
    if (!name) return null;
    
    // Remove common suffixes and prefixes
    let cleaned = name
      .replace(/\s*\(You\)\s*/gi, '') // Remove "(You)"
      .replace(/\s*\(Host\)\s*/gi, '') // Remove "(Host)"
      .replace(/\s*\(Presenter\)\s*/gi, '') // Remove "(Presenter)"
      .replace(/\s*\(Guest\)\s*/gi, '') // Remove "(Guest)"
      .replace(/^(Mr\.|Ms\.|Dr\.|Prof\.)\s*/gi, '') // Remove titles
      .trim();
    
    // Further validation after cleaning
    if (cleaned.length < 2 || cleaned.length > 50) return null;
    
    // Check if it looks like a real name (has at least one letter)
    if (!/[a-zA-Z]/.test(cleaned)) return null;
    
    return cleaned;
  }

  getMeetingId() {
    const url = new URL(window.location.href);
    return url.pathname.split('/').pop() || 'unknown';
  }

  observeEnvironment() {
    const debounced = aaDebounce(()=>{ this.reposition(); if (this.state.visible) this.applyLayoutPush(); this.moveUnderline(); },100);
    const mo = new MutationObserver(debounced);
    mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
    window.addEventListener('resize', debounced);
  }

  applyLayoutPush() {
    this.layoutSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el && el.style) {
          el.style.marginRight = '350px';
          el.style.transition = 'margin-right 0.3s ease';
        }
      });
    });
  }

  removeLayoutPush() {
    this.layoutSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el && el.style) {
          el.style.marginRight = '';
          el.style.transition = '';
        }
      });
    });
  }

  addTabListeners() {
    if (!this.sidebar) return;
    const tabButtons = this.sidebar.querySelectorAll('.agent-assist-tab');
    tabButtons.forEach(btn => btn.addEventListener('click', () => this.switchTab(btn.dataset.tab)));
    this.sidebar.querySelector('.agent-assist-tablist').addEventListener('keydown', (e)=>this.handleTabKeydown(e));
  }
  handleTabKeydown(e) {
    const keys = ['ArrowLeft','ArrowRight','Home','End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const tabs = [...this.sidebar.querySelectorAll('.agent-assist-tab')];
    let idx = tabs.findIndex(t=>t.getAttribute('aria-selected')==='true');
    if (e.key==='ArrowRight') idx=(idx+1)%tabs.length; else if (e.key==='ArrowLeft') idx=(idx-1+tabs.length)%tabs.length; else if (e.key==='Home') idx=0; else if (e.key==='End') idx=tabs.length-1;
    tabs[idx].focus();
    if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { this.switchTab(tabs[idx].dataset.tab); }
  }

  // Removed Azure STT configuration functions

}

// Initialize the Agent Assist extension
let agentAssist;

function initializeAgentAssist() { 
  if (window.location.hostname === 'meet.google.com' && !agentAssist) { 
    agentAssist = new AgentAssistSidebar(); 
    // Removed Azure STT configuration helpers
    
    // Debug helper to check speech recognition status
    window.AgentAssistDebugStatus = () => {
      if (!agentAssist) {
        console.log('Agent Assist not initialized');
        return;
      }
      console.log('Agent Assist Status:', {
        isStreaming: agentAssist.isStreaming,
        speechRecognitionStarting: agentAssist.speechRecognitionStarting,
        speechRecognitionManualStop: agentAssist.speechRecognitionManualStop,
        speechRecognition: agentAssist.speechRecognition ? {
          state: agentAssist.speechRecognition.state,
          handlersSet: agentAssist.speechRecognition._handlersSet
        } : null,
        websocketConnected: !!(agentAssist.wsAudio && agentAssist.wsAudio.readyState === WebSocket.OPEN)
      });
    };
  } 
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAgentAssist);
} else {
  initializeAgentAssist();
}

// Handle navigation changes in SPA
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(initializeAgentAssist, 1000);
  }
}).observe(document, { subtree: true, childList: true });

// Listen for messages from background / popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!agentAssist) return;
  if (message.type === 'toggleSidebar' || message.type === 'agentAssist.toggle') agentAssist.toggle();
  if (message.type === 'agentAssist.openTab' && message.tab) agentAssist.switchTab(message.tab);
  if (message.type === 'ensureToggleButton') {
    console.log('[AgentAssist] Background script requesting toggle button check');
    agentAssist.ensureToggleButton();
    // Don't auto-show the extension unless explicitly requested
    if (message.autoShow === true) {
      agentAssist.show();
    }
    sendResponse({ success: true });
  }
  if (message.type === 'getMeetingInfo') {
    sendResponse({ participants: agentAssist.getParticipants().length, duration: null, isInMeeting: true });
  }
  if (message.type === 'getTimerState') {
    sendResponse({
      isRunning: agentAssist.timerState.isRunning,
      accumulatedTime: agentAssist.timerState.accumulatedTime,
      sessionStartTime: agentAssist.timerState.sessionStartTime
    });
  }
  return true;
});

// Allow page scripts / console in page context to configure via postMessage - REMOVED Azure functionality
window.addEventListener('message', (evt) => {
  try {
    if (!evt || evt.source !== window) return;
    const d = evt.data;
    if (!d || typeof d !== 'object') return;
    // Removed Azure STT configuration via postMessage
  } catch(e) {}
});

// Handle page unload to cleanup connections
window.addEventListener('beforeunload', () => {
  if (agentAssist && agentAssist.isStreaming) {
  agentAssist.shutdownAll();
  }
  
  // Clear any pending timeouts
  if (agentAssist && agentAssist.speechRecognitionRestartTimeout) {
    clearTimeout(agentAssist.speechRecognitionRestartTimeout);
  }
});
