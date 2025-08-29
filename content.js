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
    this.websocket = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.headerHeight = 0;
  this.lastHeaderNonZeroHeight = 0; // cache to prevent flicker
    this.contextInterval = null;
    this.underlineEl = null;
    this.layoutSelectors = [
      '.R1Qczc',
      '.crqnQb',
      '.T4LgNb',
      '[data-allocation-index]',
      'main'
    ];
    this.init();
  }

  init() {
    this.ensureToggleButton();
    this.createSidebar();
    this.connectWebSocket();
    this.setupAudioCapture();
    this.observeEnvironment();
    this.scheduleContextUpdates();
    if (window.location.hostname === 'meet.google.com') {
      setTimeout(() => this.show(), 1200);
    }
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
      <header class="agent-assist-header">
        <span class="agent-assist-brand">Sales Assistant</span>
        <button class="transparency-toggle" aria-label="Toggle Transparency" title="Toggle Transparency">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3v18M3 12h18"/>
          </svg>
        </button>
      </header>
      <div class="agent-assist-tabs">
        <div class="agent-assist-tablist" role="tablist" aria-label="Agent Assist Tabs">
          ${['assist','script','score','history','coach'].map((t,i)=>`<button role="tab" aria-selected="${t==='score'}" tabindex="${t==='score'?0:-1}" class="agent-assist-tab" data-tab="${t}" id="aa-tab-${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('')}
        </div>
        <span class="aa-status-dot live" title="Live"></span>
        <div class="agent-assist-tab-underline"></div>
      </div>
      <div class="agent-assist-content" id="aa-panel" role="tabpanel" aria-labelledby="aa-tab-score"></div>
    `;
    document.body.appendChild(el);
    this.sidebar = el;
    this.underlineEl = el.querySelector('.agent-assist-tab-underline');
    this.addTabListeners();
    this.setupDraggable();
    this.setupTransparencyToggle();
    this.renderCurrentTab();
    this.reposition();
}

setupDraggable() {
    if (!this.sidebar) return;
    const header = this.sidebar.querySelector('.agent-assist-header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
        if (e.target.closest('.transparency-toggle')) return; // Don't drag when clicking toggle
        
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        
        if (e.target === header) {
            isDragging = true;
        }
    };

    const dragEnd = () => {
        isDragging = false;
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

    header.addEventListener('touchstart', dragStart, false);
    header.addEventListener('touchend', dragEnd, false);
    header.addEventListener('touchmove', drag, false);
    header.addEventListener('mousedown', dragStart, false);
    document.addEventListener('mousemove', drag, false);
    document.addEventListener('mouseup', dragEnd, false);
}

setupTransparencyToggle() {
    if (!this.sidebar) return;
    const toggle = this.sidebar.querySelector('.transparency-toggle');
    toggle.addEventListener('click', () => {
        this.sidebar.classList.toggle('transparent');
        toggle.classList.toggle('active');
        // Save state to local storage if needed
        localStorage.setItem('agentAssistTransparent', this.sidebar.classList.contains('transparent'));
    });
    
    // Restore previous state
    if (localStorage.getItem('agentAssistTransparent') === 'true') {
        this.sidebar.classList.add('transparent');
        toggle.classList.add('active');
    }
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
        return s.transcripts.slice().reverse().map(t => `<div class="aa-transcript-entry"><div class="aa-transcript-speaker">${t.speaker}</div><div class="aa-transcript-text">${t.text}</div><div class="aa-transcript-time">${new Date(t.timestamp).toLocaleTimeString()}</div></div>`).join('');
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

  connectWebSocket() {
    try {
      this.websocket = new WebSocket('ws://localhost:8000/ws/meet');
      
      this.websocket.onopen = () => {
        console.log('Agent Assist: WebSocket connected');
        this.sendContextUpdate();
      };
      
      this.websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      };
      
      this.websocket.onclose = () => {
        console.log('Agent Assist: WebSocket disconnected, attempting to reconnect...');
        setTimeout(() => this.connectWebSocket(), 3000);
      };
      
      this.websocket.onerror = (error) => {
        console.error('Agent Assist: WebSocket error:', error);
      };
    } catch (error) {
      console.error('Agent Assist: Failed to connect WebSocket:', error);
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

  addTranscript(speaker, text, timestamp) { this.state.transcripts.push({ speaker, text, timestamp: timestamp||Date.now() }); if (this.state.currentTab==='script') this.renderCurrentTab(); }
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

  setupAudioCapture() {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        this.audioStream = stream;
        this.mediaRecorder = new MediaRecorder(stream);
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && this.websocket?.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = reader.result.split(',')[1];
              this.websocket.send(JSON.stringify({
                type: 'audio',
                encoding: 'base64',
                data: base64Data
              }));
            };
            reader.readAsDataURL(event.data);
          }
        };
        
        // Start recording in chunks
        this.mediaRecorder.start(1000);
      })
      .catch(error => {
        console.error('Agent Assist: Failed to setup audio capture:', error);
      });
  }

  sendContextUpdate() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      const context = {
        type: 'context',
        participants: this.getParticipants(),
        meetingId: this.getMeetingId(),
        timestamp: Date.now()
      };
      
      this.websocket.send(JSON.stringify(context));
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

  applyLayoutPush() {
  const width = getComputedStyle(document.documentElement).getPropertyValue('--assist-width').trim() || '416px';
    this.layoutSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { if(!el.dataset._assistPushed){ el.dataset._assistOriginalMarginRight = el.style.marginRight; el.dataset._assistPushed='1'; } el.style.marginRight = width; });
    });
    document.body.style.paddingRight = width; // fallback
  }
  removeLayoutPush() {
    this.layoutSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { if(el.dataset._assistPushed){ el.style.marginRight = el.dataset._assistOriginalMarginRight || ''; delete el.dataset._assistPushed; delete el.dataset._assistOriginalMarginRight; } });
    });
    document.body.style.paddingRight='';
  }
}

// Legacy LayoutPusher removed; integrated into AgentAssistSidebar

// Initialize the Agent Assist extension
let agentAssist;

function initializeAgentAssist() { if (window.location.hostname === 'meet.google.com' && !agentAssist) { agentAssist = new AgentAssistSidebar(); } }

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
