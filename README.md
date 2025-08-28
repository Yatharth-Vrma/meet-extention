# Agent Assist Chrome Extension

## Overview
Agent Assist is a Chrome extension that provides real-time assistance for Google Meet sessions. It adds a sidebar with AI-powered insights, scoring, transcription, and coaching features.

## Features
- **Real-time Assist**: AI suggestions during meetings
- **Meeting Scoring**: Performance analysis and feedback
- **Live Transcription**: Real-time speech-to-text
- **Meeting History**: Track past meetings and insights
- **AI Coaching**: Communication tips and improvements

## Installation
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon will appear in your browser toolbar

## Usage
1. Navigate to Google Meet (meet.google.com)
2. The extension will automatically inject the sidebar
3. Use the floating toggle button (🤖) to show/hide the sidebar
4. Switch between tabs: Assist, Script, Score, History, Coach

## Files Structure
- `manifest.json` - Extension configuration
- `content.js` - Main extension logic and sidebar implementation
- `background.js` - Service worker for tab management
- `styles.css` - Sidebar styling
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality

## Technical Details
- Uses WebSocket connection to backend server (ws://localhost:8000/ws/meet)
- Captures audio using MediaRecorder API
- Dynamically adjusts Google Meet layout
- Observes DOM changes for layout consistency

## Backend Integration
The extension expects a WebSocket server at `ws://localhost:8000/ws/meet` that handles:
- Audio streaming
- Context updates
- Real-time suggestions
- Meeting analysis

## Browser Compatibility
- Chrome 88+
- Manifest V3 compatible
- Requires microphone permission for audio capture

## Development
To modify the extension:
1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon for the extension
4. Test on Google Meet

## Privacy
- Audio is only processed when explicitly enabled
- No data is stored locally without user consent
- WebSocket connections are secure and configurable
