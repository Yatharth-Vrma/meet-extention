// Debounce helper
function aaDebounce(fn, wait = 100) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }

class AgentAssistSidebar {
  constructor() {
    this.state = {
      visible: false,
      currentTab: 'score',
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
    this.init();
  }

  init() {
    this.ensureToggleButton();
    this.createSidebar();
    // Removed connectRealtimeWebSocket() for local development
    this.observeEnvironment();
    this.scheduleContextUpdates();
    if (window.location.hostname === 'meet.google.com') {
      setTimeout(() => this.show(), 1200);
    }
  // Connect results websocket immediately
  this.connectResultsWebSocket();
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  ensureToggleButton() {
    if (this.toggleButton && document.body.contains(this.toggleButton)) return;
    const btn = document.createElement('button');
    btn.className = 'agent-assist-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle Agent Assist');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M4 12h2"/><path d="M18 12h2"/><path d="M12 4v2"/><path d="M12 18v2"/><path d="M7.8 7.8l1.4 1.4"/><path d="M14.8 14.8l1.4 1.4"/><path d="M16.2 7.8l-1.4 1.4"/><path d="M9.2 14.8l-1.4 1.4"/></svg>';
    btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(btn);
    this.toggleButton = btn;
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
          <div class="agent-assist-brand">Team Standup</div>
          <div class="agent-assist-header__status">
            <div class="agent-assist-header__status-dot"></div>
            <span class="agent-assist-header__status-time">12:34</span>
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
          ${['assist','script','score','history','coach'].map(t=>`<button role="tab" aria-selected="${t==='score'}" tabindex="${t==='score'?0:-1}" class="agent-assist-tab" data-tab="${t}" id="aa-tab-${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div class="agent-assist-content" id="aa-panel" role="tabpanel" aria-labelledby="aa-tab-score"></div>
    `;
    const micToggle = el.querySelector('.mic-toggle');
    micToggle.addEventListener('click', () => { this.toggleMicrophone(); });
    
    const minimizeToggle = el.querySelector('.minimize-toggle');
    minimizeToggle.addEventListener('click', () => { this.minimizeExtension(); });
    
    document.body.appendChild(el);
    this.sidebar = el;
    this.underlineEl = el.querySelector('.agent-assist-tab-underline');
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

  minimizeExtension() {
    console.log('[AgentAssist][MINIMIZE] Minimizing extension...');
    
    // Hide the main sidebar
    this.hide();
    
    // Create floating toggle button
    this.createFloatingToggle();
  }

  createFloatingToggle() {
    // Remove existing floating button if any
    if (this.floatingButton && document.body.contains(this.floatingButton)) {
      document.body.removeChild(this.floatingButton);
    }
    
    const floatingBtn = document.createElement('button');
    floatingBtn.className = 'agent-assist-floating-toggle';
    floatingBtn.type = 'button';
    floatingBtn.setAttribute('aria-label', 'Restore Agent Assist');
    floatingBtn.setAttribute('title', 'Restore Agent Assist');
    floatingBtn.style.backgroundImage = `url('${chrome.runtime.getURL('icons/logo.png')}')`;
    floatingBtn.innerHTML = `
      <div class="floating-logo-fallback"></div>
    `;
    
    floatingBtn.addEventListener('click', () => {
      this.restoreExtension();
    });
    
    document.body.appendChild(floatingBtn);
    this.floatingButton = floatingBtn;
  }

  restoreExtension() {
    console.log('[AgentAssist][RESTORE] Restoring extension...');
    
    // Remove floating button
    if (this.floatingButton && document.body.contains(this.floatingButton)) {
      document.body.removeChild(this.floatingButton);
      this.floatingButton = null;
    }
    
    // Show the main sidebar
    this.show();
  }

  stopExtension() {
    console.log('[AgentAssist][STOP] Stopping extension...');
    
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
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
        // Only allow dragging from the drag handle, not from buttons
        if (!e.target.closest('.agent-assist-drag-handle')) return;
        
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        
        isDragging = true;
        this.sidebar.classList.add('dragging');
    };

    const dragEnd = () => {
        isDragging = false;
        this.sidebar.classList.remove('dragging');
    };

    const drag = (e) => {
        if (!isDragging) return;
        
        e.preventDefault();
        
        if (e.type === "touchmove") {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
        } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
        }

        xOffset = currentX;
        yOffset = currentY;
        
        // Constrain to window bounds
        const rect = this.sidebar.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        xOffset = Math.min(Math.max(0, xOffset), maxX);
        yOffset = Math.min(Math.max(0, yOffset), maxY);
        
        this.sidebar.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
        this.sidebar.style.right = 'auto';
        this.removeLayoutPush(); // Remove layout pushing when dragged
    };

    // Add event listeners to the drag handle
    dragHandle.addEventListener('touchstart', dragStart, false);
    dragHandle.addEventListener('touchend', dragEnd, false);
    dragHandle.addEventListener('touchmove', drag, false);
    dragHandle.addEventListener('mousedown', dragStart, false);
    document.addEventListener('mousemove', drag, false);
    document.addEventListener('mouseup', dragEnd, false);
}

  getTabHTML(tab) {
    const s = this.state;
    switch (tab) {
      case 'assist':
        if (!s.suggestions.length) return this.emptyState('💡','Ready to Assist','AI suggestions will appear here.');
        return `<div class="aa-suggestions">` + s.suggestions.slice().reverse().map((obj,i) => {
          const item = typeof obj === 'string' ? { text: obj } : obj;
          const barClass = item.bar==='green' ? ' bar-green' : '';
          return `<div class="aa-suggestion${barClass}" data-idx="${i}">${this.escapeHTML(item.text)}</div>`;
        }).join('') + '</div>';
      case 'script':
        if (!s.transcripts.length) return this.emptyState('📝','Transcript','Live transcript will appear here.');
        const aggregated = s.transcripts.map(t=>t.text).join(' ');
        const entries = s.transcripts.slice().reverse().map(t => {
          // Determine if it's user's own transcript or someone else's
          const isUser = t.speaker === 'You' || t.speaker === 'User' || t.speaker === 'Self';
          const alignmentClass = isUser ? 'user' : 'other';
          return `<div class="aa-transcript-entry ${alignmentClass}"><div class="aa-transcript-speaker">${this.escapeHTML(t.speaker)}</div><div class="aa-transcript-text">${this.escapeHTML(t.text)}</div><div class="aa-transcript-time">${new Date(t.timestamp).toLocaleTimeString()}</div></div>`;
        }).join('');
        return `<div class="aa-script-block">${this.escapeHTML(aggregated)}</div>` + entries;
      case 'score':
        if (!s.scores.length) {
          // Provide a default example card similar to screenshot
          return `<div class="aa-card accent-positive"><div class="aa-meta">${new Date().toLocaleDateString()}</div><div class="aa-title">Subject: Interview Coordination <span class="aa-pill">Positive</span></div><div class="aa-body">Result: Switching between 3–4 platforms to coordinate a single interview, leading to inefficiencies and dropped communication.</div><div class="aa-subtitle">Main Discussion Highlights:</div><ul class="aa-bullets"><li>Interview reschedules impact candidate perception and conversion rates.</li><li>Exploring solutions that auto-sync calendars and reduce manual coordination.</li></ul><div class="aa-subtitle">Key Numbers:</div><ul class="aa-bullets"><li>4+ tools used per interview cycle.</li><li>>60% of interviews require at least one reschedule.</li></ul><a class="aa-link" href="#" tabindex="-1">See Less</a></div>`;
        }
        return s.scores.slice().reverse().map(sc => `<div class="aa-card ${sc.score>=80?'accent-positive':''}"><div class="aa-meta">${new Date(sc.timestamp).toLocaleDateString()}</div><div class="aa-title">Score Update <span class="aa-pill">${sc.badge||'Update'}</span></div><div class="aa-body">${sc.feedback||''}</div></div>`).join('');
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

  toggle() { this.state.visible ? this.hide() : this.show(); }
show() {
    if (!this.sidebar) return;
    this.state.visible = true;
    this.sidebar.classList.add('is-visible');
    
    // Only apply layout push if not dragged
    if (!this.sidebar.style.transform) {
        this.reposition();
        this.applyLayoutPush();
    }
    
    this.updateToggleVisual();
    this.moveUnderline();
}  hide() { if (!this.sidebar) return; this.state.visible = false; this.sidebar.classList.remove('is-visible'); this.removeLayoutPush(); this.updateToggleVisual(); }
  updateToggleVisual() { if (!this.toggleButton) return; this.toggleButton.classList.toggle('active', this.state.visible); this.toggleButton.setAttribute('aria-pressed', this.state.visible?'true':'false'); }

  detectHeaderHeight() { return 0; } // Force flush to top
  reposition() {
    if (!this.sidebar) return;
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
    const tipsHTML = this.state.coaching.slice().reverse().map(c => `<div class="aa-coach-tip"><div class="aa-coach-category">${this.escapeHTML(c.category)}</div><div class="aa-coach-title">${this.escapeHTML(c.title)}</div><div class="aa-coach-body">${this.escapeHTML(c.content)}</div></div>`).join('');
    const messages = this.state.coachChat.map(m => `<div class="aa-msg ${m.role}">${this.escapeHTML(m.text)}</div>`).join('');
    return `<div class="aa-coach-layout">`+
      `<div class="aa-coach-tips-scroll">${tipsHTML || this.emptyState('🎯','Coaching','Coaching tips will appear here.')}</div>`+
      `<div class="aa-coach-chat"><div class="aa-chat-messages" id="aa-chat-messages">${messages}</div>`+
      `<form class="aa-chat-input-row" id="aa-chat-form"><input type="text" id="aa-chat-input" placeholder="Type a message..." autocomplete="off" /><button type="submit">Send</button></form></div>`+
    `</div>`;
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

  getParticipants() {
    const participants = [];
    document.querySelectorAll('[data-self-name]').forEach(element => {
      const name = element.getAttribute('data-self-name');
      if (name && !participants.includes(name)) {
        participants.push(name);
      }
    });
    return participants;
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
  if (message.type === 'getMeetingInfo') {
    sendResponse({ participants: agentAssist.getParticipants().length, duration: null, isInMeeting: true });
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
