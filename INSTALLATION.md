# Agent Assist Extension - Installation Guide

## 🚀 Quick Setup

### Step 1: Install the Chrome Extension

1. **Download the Extension**
   - Navigate to the folder: `/home/zel/Documents/meet extention`
   - This contains all the extension files

2. **Load into Chrome**
   - Open Chrome browser
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the folder: `/home/zel/Documents/meet extention`
   - The extension should now appear in your extensions list

3. **Grant Permissions**
   - Click on the extension when prompted
   - Allow microphone access when requested
   - Grant any additional permissions needed

### Step 2: Start the Test Server (Optional)

For full functionality with AI features, run the test WebSocket server:

```bash
cd "/home/zel/Documents/meet extention"
python3 test_server.py
```

This will start a server at `ws://localhost:8000/ws/meet` that provides:
- Simulated AI suggestions
- Mock transcription
- Test coaching tips
- Sample scoring data

### Step 3: Test the Extension

1. **Open Google Meet**
   - Go to https://meet.google.com
   - Start or join a meeting

2. **Verify Extension is Working**
   - Look for a floating robot button (🤖) on the right side
   - The sidebar should automatically appear after 2 seconds
   - If not, click the robot button to toggle it

3. **Explore Features**
   - **Score Tab**: See the demo meeting analysis (pre-populated)
   - **Assist Tab**: Real-time AI suggestions (requires server)
   - **Script Tab**: Live transcription (requires server)
   - **History Tab**: Past meeting records
   - **Coach Tab**: Communication coaching tips

## 🎯 Features Overview

### Sidebar Interface
- **Width**: 350px sidebar on the right
- **Auto-layout**: Automatically pushes Google Meet content left
- **Toggle**: Use the floating button to show/hide
- **Responsive**: Adapts to Google Meet's UI changes

### Score Tab (Main Feature)
Displays exactly as shown in the screenshot:
- Date badge: "25 July 2025"
- Status badge: "Positive" (green)
- Subject: "Interview Coordination"
- Detailed result analysis
- Discussion highlights with bullet points
- Key numbers and statistics
- "See Less" link

### Real-time Features (with server)
- **Audio Capture**: Captures microphone input
- **WebSocket Communication**: Sends data to backend
- **Live Updates**: Receives suggestions and insights
- **Context Awareness**: Tracks participants and meeting info

## 🛠 Customization

### Modify Content
Edit `content.js` to change:
- Sidebar content and styling
- WebSocket server URL
- Update intervals
- Feature behavior

### Style Changes
Edit `styles.css` to customize:
- Colors and themes
- Layout and positioning
- Animations and transitions
- Responsive behavior

### Server Integration
The extension expects a WebSocket server that handles:
```json
{
  "type": "suggestion",
  "content": "Your AI suggestion here"
}
```

## 🔧 Troubleshooting

### Extension Not Loading
- Check Developer mode is enabled
- Verify all files are in the correct directory
- Look for errors in `chrome://extensions/`

### Sidebar Not Appearing
- Refresh the Google Meet page
- Click the robot toggle button
- Check browser console for errors
- Ensure you're on a meet.google.com page

### WebSocket Connection Issues
- Verify test server is running on port 8000
- Check firewall settings
- Look for connection errors in browser console

### Audio Not Working
- Grant microphone permissions
- Check Chrome's site permissions
- Verify microphone is not used by other apps

## 📱 Browser Compatibility

- **Chrome**: 88+ (recommended)
- **Edge**: 88+ (Chromium-based)
- **Manifest**: V3 compatible
- **Permissions**: Requires microphone and tab access

## 🔒 Privacy & Security

- Audio processing only when enabled
- No persistent storage of sensitive data
- WebSocket connections are local by default
- All permissions explicitly requested

## 📝 Development Notes

### File Structure
```
meet extention/
├── manifest.json          # Extension configuration
├── content.js             # Main sidebar logic
├── background.js          # Service worker
├── styles.css            # Sidebar styling
├── popup.html            # Extension popup
├── popup.js              # Popup functionality
├── test_server.py        # WebSocket test server
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md            # Documentation
```

### Key Classes
- `AgentAssistSidebar`: Main extension logic
- `LayoutPusher`: Handles Google Meet layout adjustments

### WebSocket Messages
The extension sends/receives these message types:
- `context`: Meeting participant updates
- `audio`: Microphone audio data
- `suggestion`: AI recommendations
- `transcript`: Speech-to-text results
- `score`: Meeting performance metrics
- `coaching`: Communication tips

---

## 🎉 You're Ready!

Your Agent Assist extension is now set up and ready to enhance your Google Meet experience with AI-powered insights and real-time assistance!
