# Agent Assist Chrome Extension

## Overview
Agent Assist is a Chrome extension that provides real-time assistance for Google Meet sessions. It adds a sidebar with AI-powered insights, scoring, transcription, and coaching features.

## Features
- **Real-time Assist**: AI suggestions during meetings
- **Meeting Scoring**: Performance analysis and feedback
- **Live Transcription**: Real-time speech-to-text using Azure Speech Services
- **Meeting History**: Track past meetings and insights
- **AI Coaching**: Communication tips and improvements
- **Dual Audio Capture**: Your microphone + other participants' audio
- **Azure STT Integration**: Professional-grade speech recognition

## Installation

### Step 1: Install the Chrome Extension
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon will appear in your browser toolbar

### Step 2: Configure Azure Speech-to-Text (Required for Transcription)
1. **Get Azure Speech Service**:
   - Go to [Azure Portal](https://portal.azure.com)
   - Create a new "Speech Service" resource
   - Note your **Region** (e.g., `eastus`, `westus`) and **API Key**

2. **Configure in Extension**:
   - Click the extension icon in Chrome toolbar
   - Click "Configure Azure STT"
   - Enter your Azure Region and API Key
   - Click "Save"

### Step 3: Test the Extension
1. Navigate to Google Meet (meet.google.com)
2. The extension will automatically inject the sidebar
3. Use the floating toggle button (🤖) to show/hide the sidebar
4. Switch between tabs: Assist, Script, Score, History, Coach

## Usage

### Audio Capture Setup
The extension captures two audio streams:
1. **Your Microphone**: Automatically captured for your speech
2. **Other Participants**: Requires screen sharing setup

#### To Capture Other Participants' Audio:
1. When prompted, select "Chrome Tab" for the Google Meet tab
2. **IMPORTANT**: Check "Share tab audio" checkbox
3. Click "Share"

#### Alternative Methods (if tab sharing doesn't work):
- **System Audio**: Select "System Audio" when prompted
- **Desktop**: Select your entire screen/desktop
- **Visual Detection**: Falls back to visual cues if audio capture fails

### Features Overview

#### Script Tab (Transcription)
- Real-time transcription of both your speech and other participants
- Uses Azure Speech Services for high accuracy
- Supports multiple languages
- Word-level timestamps available

#### Score Tab
- Meeting performance analysis
- Communication metrics
- Discussion highlights
- Key statistics

#### Assist Tab
- Real-time AI suggestions
- Context-aware recommendations
- Meeting guidance

#### History Tab
- Past meeting records
- Transcript archives
- Performance trends

#### Coach Tab
- Communication tips
- Best practices
- Improvement suggestions

## Technical Details

### Azure STT Configuration
The extension uses Azure Speech Services for professional-grade transcription:

```javascript
// Configure via browser console
window.AgentAssistConfigureAzureSTT('eastus', 'your-api-key-here');

// Or via popup interface
// Click extension icon → Configure Azure STT
```

### Audio Processing
- **Sample Rate**: 16kHz (optimized for Azure STT)
- **Format**: WAV with 16-bit PCM
- **VAD**: Voice Activity Detection with configurable thresholds
- **Segmentation**: Automatic speech segment detection

### Browser Compatibility
- **Chrome**: 88+ (recommended)
- **Edge**: 88+ (Chromium-based)
- **Manifest**: V3 compatible
- **Permissions**: Requires microphone and tab access

## Troubleshooting

### Extension Not Loading
- Check Developer mode is enabled
- Verify all files are in the correct directory
- Look for errors in `chrome://extensions/`

### Sidebar Not Appearing
- Refresh the Google Meet page
- Click the robot toggle button
- Check browser console for errors
- Ensure you're on a meet.google.com page

### Azure STT Not Working
- Verify Azure Speech Service is active
- Check region and API key are correct
- Look for errors in browser console
- Ensure you have sufficient Azure credits

### Audio Capture Issues
- Grant microphone permissions
- Check Chrome's site permissions
- Verify microphone is not used by other apps
- Try different screen sharing methods

### Other Participants Not Transcribed
1. **Check Screen Sharing**: Ensure "Share tab audio" is enabled
2. **Try Alternative Methods**: Use system audio or desktop capture
3. **Visual Detection**: Extension falls back to visual cues
4. **Browser Console**: Check for audio capture errors

## Development

### File Structure
```
meet extention/
├── manifest.json          # Extension configuration
├── content.js             # Main sidebar logic
├── background.js          # Service worker
├── audio-vad-processor.js # Audio processing worklet
├── styles.css            # Sidebar styling
├── popup.html            # Extension popup
├── popup.js              # Popup functionality
├── icons/                # Extension icons
└── README.md            # Documentation
```

### Key Classes
- `AgentAssistSidebar`: Main extension logic
- `VADProcessor`: Voice Activity Detection
- Audio processing pipeline for Azure STT

### WebSocket Messages (Legacy)
The extension previously used WebSocket connections for real-time features. This has been replaced with Azure STT for transcription.

## Privacy & Security

- Audio is only processed when explicitly enabled
- Azure STT credentials are stored securely in Chrome sync storage
- No audio data is stored locally
- All permissions are explicitly requested
- Azure STT processing follows Microsoft's privacy policies

## Support

### Common Issues
1. **"Azure STT not configured"**: Set up Azure Speech Service and configure credentials
2. **"No audio captured"**: Check screen sharing settings and permissions
3. **"Transcription not working"**: Verify Azure service is active and has credits

### Debug Mode
Open browser console on Google Meet page and use:
```javascript
// Check Azure STT status
console.log(window.agentAssist?.remoteTranscription);

// Configure Azure STT manually
window.AgentAssistConfigureAzureSTT('your-region', 'your-api-key');

// Check audio capture status
console.log(window.agentAssist?.isStreaming);
```

---

## 🎉 You're Ready!

Your Agent Assist extension is now set up with professional-grade Azure Speech-to-Text transcription and ready to enhance your Google Meet experience!
