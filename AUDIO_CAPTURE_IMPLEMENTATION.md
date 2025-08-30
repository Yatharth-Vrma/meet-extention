# Audio Capture and Azure STT Implementation Guide

## 🎯 Goal
Capture your microphone and other participants' audio from Google Meet, send both to Azure STT, and display transcriptions on left (your mic) and right (other participants) sides.

## 📋 Implementation Steps

### Step 1: Local Microphone Capture (Your Audio)

```javascript
// 1. Request microphone access with detailed logging
async startLocalSpeechRecognition() {
  try {
    console.log('[AgentAssist][MIC] Starting microphone capture and Azure STT...');
    
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

// 2. Set up local audio processing
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
      
      console.log('[AgentAssist][MIC] Local audio processing pipeline ready');
      
    }).catch(err => {
      console.error('[AgentAssist][MIC] Failed to load audio worklet:', err);
    });
    
  } catch (error) {
    console.error('[AgentAssist][MIC] Error setting up local audio processing:', error);
  }
}

// 3. Handle local audio segments
handleLocalSegment(float32, sr) {
  console.log('[AgentAssist][MIC] Processing local audio segment...');
  
  // Downsample if needed
  if (sr !== this.remoteTranscription.sampleRate) {
    console.log('[AgentAssist][MIC] Downsampling from', sr, 'to', this.remoteTranscription.sampleRate);
    float32 = this.downsampleFloat32(float32, sr, this.remoteTranscription.sampleRate);
    sr = this.remoteTranscription.sampleRate;
  }
  
  // Send to Azure STT
  this.sendLocalSegmentToAzure(float32, sr);
}

// 4. Send local audio to Azure STT
sendLocalSegmentToAzure(float32, sr) {
  console.log('[AgentAssist][MIC] Sending local audio segment to Azure STT...');
  
  const rt = this.remoteTranscription;
  if (!rt.endpoint || !rt.apiKey) {
    console.log('[AgentAssist][MIC] Azure STT not configured, skipping');
    return;
  }
  
  // Convert audio to WAV
  const wavBlob = this.floatToWavBlob(float32, sr);
  console.log('[AgentAssist][MIC] Audio converted to WAV, size:', wavBlob.size, 'bytes');
  
  // Build Azure STT URL
  const url = new URL(rt.endpoint);
  url.searchParams.append('language', rt.language);
  url.searchParams.append('format', rt.format);
  url.searchParams.append('profanityFilter', rt.profanityFilter);
  if (rt.enableWordLevelTimestamps) {
    url.searchParams.append('enableWordLevelTimestamps', 'true');
  }
  
  console.log('[AgentAssist][MIC] Sending to Azure STT:', url.toString());
  
  fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': rt.apiKey,
      'Content-Type': 'audio/wav',
      'Accept': 'application/json'
    },
    body: wavBlob
  }).then(response => {
    console.log('[AgentAssist][MIC] Azure STT response status:', response.status);
    if (!response.ok) {
      throw new Error(`Azure STT error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }).then(json => {
    console.log('[AgentAssist][MIC] Azure STT response:', json);
    
    // Handle Azure STT response format
    let text = '';
    if (json.DisplayText) {
      text = json.DisplayText;
    } else if (json.NBest && json.NBest.length > 0) {
      text = json.NBest[0].Display || json.NBest[0].Lexical;
    } else if (json.Text) {
      text = json.Text;
    }
    
    if (text && text.trim()) {
      console.log('[AgentAssist][MIC] Transcribed text:', text);
      this.addTranscript('You', text.trim(), Date.now());
    } else {
      console.log('[AgentAssist][MIC] No text in Azure STT response');
    }
  }).catch(err => {
    console.error('[AgentAssist][MIC] Azure STT error:', err);
  });
}
```

### Step 2: Remote Audio Capture (Other Participants)

```javascript
// 1. Start remote audio capture
async startTabAudioCapture() {
  try {
    console.log('[AgentAssist][REMOTE] Starting other participants audio capture...');
    
    // Method 1: Chrome tab capture
    try {
      console.log('[AgentAssist][REMOTE] Trying chrome.tabCapture API...');
      const response = await chrome.runtime.sendMessage({ type: 'captureTabAudio' });
      
      if (response && response.success) {
        console.log('[AgentAssist][REMOTE] Chrome tab capture successful');
        this.setupChromeTabAudioProcessing(response);
        return;
      } else {
        console.log('[AgentAssist][REMOTE] Chrome tab capture failed:', response?.error);
      }
    } catch (chromeError) {
      console.log('[AgentAssist][REMOTE] Chrome tab capture error:', chromeError.message);
    }
    
    // Method 2: Screen sharing with tab audio
    try {
      console.log('[AgentAssist][REMOTE] Requesting screen sharing with tab audio...');
      console.log('[AgentAssist][REMOTE] IMPORTANT: Select "Chrome Tab" and enable "Share tab audio"');
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'browser' },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000
        },
        preferCurrentTab: true
      });
      
      console.log('[AgentAssist][REMOTE] Display media capture successful');
      console.log('[AgentAssist][REMOTE] Audio tracks:', stream.getAudioTracks().length);
      console.log('[AgentAssist][REMOTE] Video tracks:', stream.getVideoTracks().length);
      
      if (stream.getAudioTracks().length > 0) {
        console.log('[AgentAssist][REMOTE] Got audio from display capture!');
        this.setupOtherParticipantAudioProcessing(stream);
        return;
      } else {
        console.log('[AgentAssist][REMOTE] No audio in display stream - "Share tab audio" not enabled');
        this.setupEnhancedSpeakingDetection();
        return;
      }
      
    } catch (displayError) {
      console.log('[AgentAssist][REMOTE] Display media failed:', displayError.message);
    }
    
    // Method 3: System audio
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
    
    // Fallback to visual detection
    console.log('[AgentAssist][REMOTE] Audio capture not available, using visual detection');
    this.setupEnhancedSpeakingDetection();
    
  } catch (error) {
    console.error('[AgentAssist][REMOTE] Tab audio capture error:', error);
    this.setupEnhancedSpeakingDetection();
  }
}

// 2. Set up remote audio processing
async setupOtherParticipantAudioProcessing(stream) {
  try {
    console.log('[AgentAssist][REMOTE] Setting up other participants audio processing...');
    
    // Check audio tracks
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
    
    // Create audio context
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
      
      console.log('[AgentAssist][REMOTE] Other participants audio processing pipeline ready');
      
    } catch (err) {
      console.error('[AgentAssist][REMOTE] AudioWorklet pipeline failed:', err);
      this.setupEnhancedSpeakingDetection();
    }
    
  } catch (error) {
    console.error('[AgentAssist][REMOTE] Error setting up other participants audio processing:', error);
    this.setupEnhancedSpeakingDetection();
  }
}

// 3. Handle remote audio segments
handleRemoteSegment(float32, sr) {
  console.log('[AgentAssist][REMOTE] Processing remote audio segment...');
  
  if (sr !== this.remoteTranscription.sampleRate) {
    console.log('[AgentAssist][REMOTE] Downsampling from', sr, 'to', this.remoteTranscription.sampleRate);
    float32 = this.downsampleFloat32(float32, sr, this.remoteTranscription.sampleRate);
    sr = this.remoteTranscription.sampleRate;
  }
  
  this.sendRemoteSegment(float32, sr);
}

// 4. Send remote audio to Azure STT
sendRemoteSegment(float32, sr) {
  console.log('[AgentAssist][REMOTE] Sending remote audio segment to Azure STT...');
  
  const rt = this.remoteTranscription;
  if (!rt.endpoint || !rt.apiKey) {
    if (!rt.warned) {
      console.log('[AgentAssist][REMOTE] Azure STT not configured. Please set azureSttRegion and azureSttApiKey');
      rt.warned = true;
    }
    rt.enabled = false; 
    return;
  }
  
  if (rt.sending) { 
    console.log('[AgentAssist][REMOTE] Busy, dropping segment'); 
    return; 
  }
  
  rt.sending = true;
  console.log('[AgentAssist][REMOTE] Processing remote audio segment...');
  
  // Convert audio to WAV
  const wavBlob = this.floatToWavBlob(float32, sr);
  console.log('[AgentAssist][REMOTE] Audio converted to WAV, size:', wavBlob.size, 'bytes');
  
  // Build Azure STT URL
  const url = new URL(rt.endpoint);
  url.searchParams.append('language', rt.language);
  url.searchParams.append('format', rt.format);
  url.searchParams.append('profanityFilter', rt.profanityFilter);
  if (rt.enableWordLevelTimestamps) {
    url.searchParams.append('enableWordLevelTimestamps', 'true');
  }
  
  console.log('[AgentAssist][REMOTE] Sending to Azure STT:', url.toString());
  
  fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': rt.apiKey,
      'Content-Type': 'audio/wav',
      'Accept': 'application/json'
    },
    body: wavBlob
  }).then(response => {
    console.log('[AgentAssist][REMOTE] Azure STT response status:', response.status);
    if (!response.ok) {
      throw new Error(`Azure STT error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }).then(json => {
    console.log('[AgentAssist][REMOTE] Azure STT response:', json);
    
    // Handle Azure STT response format
    let text = '';
    if (json.DisplayText) {
      text = json.DisplayText;
    } else if (json.NBest && json.NBest.length > 0) {
      text = json.NBest[0].Display || json.NBest[0].Lexical;
    } else if (json.Text) {
      text = json.Text;
    }
    
    if (text && text.trim()) {
      console.log('[AgentAssist][REMOTE] Transcribed text:', text);
      this.addTranscript('Other Participant', text.trim(), Date.now());
    } else {
      console.log('[AgentAssist][REMOTE] No text in Azure STT response');
    }
  }).catch(err => {
    console.error('[AgentAssist][REMOTE] Azure STT error:', err);
  }).finally(() => { 
    rt.sending = false; 
    console.log('[AgentAssist][REMOTE] Azure STT request completed');
  });
}
```

### Step 3: Audio Processing Utilities

```javascript
// Downsample audio
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

// Convert to WAV format
floatToWavBlob(float32, sampleRate) {
  // Convert to 16-bit PCM and wrap WAV header
  const pcm16 = new Int16Array(float32.length);
  for (let i=0;i<float32.length;i++){ 
    let s = Math.max(-1, Math.min(1, float32[i])); 
    pcm16[i] = s<0? s*0x8000 : s*0x7FFF; 
  }
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + pcm16.length * bytesPerSample);
  const view = new DataView(buffer);
  let offset = 0;
  const writeStr = (s)=>{ for (let i=0;i<s.length;i++) view.setUint8(offset++, s.charCodeAt(i)); };
  writeStr('RIFF');
  view.setUint32(offset, 36 + pcm16.length * bytesPerSample, true); offset += 4;
  writeStr('WAVE');
  writeStr('fmt ');
  view.setUint32(offset,16,true); offset+=4; // subchunk1 size
  view.setUint16(offset,1,true); offset+=2; // PCM
  view.setUint16(offset,1,true); offset+=2; // channels
  view.setUint32(offset,sampleRate,true); offset+=4;
  view.setUint32(offset,byteRate,true); offset+=4;
  view.setUint16(offset,blockAlign,true); offset+=2;
  view.setUint16(offset,16,true); offset+=2; // bits per sample
  writeStr('data');
  view.setUint32(offset, pcm16.length * bytesPerSample, true); offset+=4;
  for (let i=0;i<pcm16.length;i++,offset+=2) view.setInt16(offset, pcm16[i], true);
  return new Blob([buffer], { type: 'audio/wav' });
}
```

### Step 4: Display Transcriptions

```javascript
// Add transcript with speaker identification
addTranscript(speaker, text, timestamp) {
  if (!speaker) return;
  if (speaker.toLowerCase() === 'system') {
    console.log('[AgentAssist][SYSTEM]', text);
    return;
  }
  
  const isUser = /^(you|user|self)$/i.test(speaker);
  const displaySpeaker = isUser ? 'You' : (speaker === 'other' ? 'Other Participant' : speaker);
  
  console.log(`[AgentAssist][TRANSCRIPT] + ${displaySpeaker}: ${text}`);
  
  this.state.transcripts.push({ 
    speaker: displaySpeaker, 
    text: (text||'').trim(), 
    timestamp: timestamp || Date.now(), 
    isUser 
  });
  
  if (this.state.currentTab === 'script') this.renderCurrentTab();
}
```

## 🔍 Debugging Commands

```javascript
// Check Azure STT configuration
console.log(window.agentAssist?.remoteTranscription);

// Check audio streams
console.log(window.agentAssist?.localMicStream);
console.log(window.agentAssist?.otherAudioStream);

// Check audio contexts
console.log(window.agentAssist?.localAudioContext);
console.log(window.agentAssist?.remoteAudioContext);

// Configure Azure STT
window.AgentAssistConfigureAzureSTT('your-region', 'your-api-key');

// Force restart audio capture
window.agentAssist?.startLocalSpeechRecognition();
window.agentAssist?.startTabAudioCapture();
```

## 📊 Expected Console Output

### Successful Setup:
```
[AgentAssist][MIC] Starting microphone capture and Azure STT...
[AgentAssist][MIC] Requesting microphone access...
[AgentAssist][MIC] Microphone access granted
[AgentAssist][MIC] Setting up audio processing pipeline...
[AgentAssist][MIC] Audio context created, sample rate: 48000
[AgentAssist][MIC] Media stream source created
[AgentAssist][MIC] Audio worklet loaded successfully
[AgentAssist][MIC] VAD processor created
[AgentAssist][MIC] Audio pipeline connected
[AgentAssist][MIC] Local audio processing pipeline ready

[AgentAssist][REMOTE] Starting other participants audio capture...
[AgentAssist][REMOTE] Requesting screen sharing with tab audio...
[AgentAssist][REMOTE] IMPORTANT: Select "Chrome Tab" and enable "Share tab audio"
[AgentAssist][REMOTE] Display media capture successful
[AgentAssist][REMOTE] Audio tracks: 1
[AgentAssist][REMOTE] Video tracks: 1
[AgentAssist][REMOTE] Got audio from display capture!
[AgentAssist][REMOTE] Setting up other participants audio processing...
[AgentAssist][REMOTE] Audio tracks found: 1
[AgentAssist][REMOTE] Audio context created, sample rate: 48000
[AgentAssist][REMOTE] Media stream source created
[AgentAssist][REMOTE] Audio worklet loaded successfully
[AgentAssist][REMOTE] VAD processor created
[AgentAssist][REMOTE] Audio pipeline connected
[AgentAssist][REMOTE] Other participants audio processing pipeline ready
```

### Speech Detection:
```
[AgentAssist][MIC] Speech segment detected, length: 3200 samples
[AgentAssist][MIC] Processing local audio segment...
[AgentAssist][MIC] Downsampling from 48000 to 16000
[AgentAssist][MIC] Sending local audio segment to Azure STT...
[AgentAssist][MIC] Audio converted to WAV, size: 12844 bytes
[AgentAssist][MIC] Sending to Azure STT: https://eastus.stt.speech.microsoft.com/...
[AgentAssist][MIC] Azure STT response status: 200
[AgentAssist][MIC] Azure STT response: {DisplayText: "Hello world"}
[AgentAssist][MIC] Transcribed text: Hello world
[AgentAssist][TRANSCRIPT] + You: Hello world
```

## 🎯 Key Points

1. **Your Microphone**: Captured via `getUserMedia()` and sent to Azure STT
2. **Other Participants**: Captured via screen sharing with "Share tab audio" enabled
3. **Azure STT**: Both audio streams sent to Azure for professional transcription
4. **Display**: Your speech shows as "You", others show as "Other Participant"
5. **Logging**: Every step logged with `[MIC]` and `[REMOTE]` prefixes for easy debugging

## 🚀 Next Steps

1. Implement this code in `content.js`
2. Test microphone capture
3. Test screen sharing with tab audio
4. Verify Azure STT responses
5. Check transcription display in the sidebar
