# Agent Assist Extension - Complete Setup Guide

## 🚀 Quick Start (5 minutes)

### Step 1: Install the Extension
1. **Load Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the folder: `/home/zel/Documents/meet extention`
   - The extension icon should appear in your toolbar

### Step 2: Get Azure Speech Service
1. **Create Azure Account** (if you don't have one):
   - Go to [Azure Portal](https://portal.azure.com)
   - Sign up for a free account (includes $200 credit)

2. **Create Speech Service**:
   - In Azure Portal, click "Create a resource"
   - Search for "Speech Service"
   - Click "Create"
   - Fill in the details:
     - **Subscription**: Your subscription
     - **Resource group**: Create new or use existing
     - **Region**: Choose closest to you (e.g., `eastus`, `westus`)
     - **Name**: Give it a name (e.g., "my-speech-service")
     - **Pricing tier**: Start with "Free (F0)" for testing
   - Click "Review + create" then "Create"

3. **Get Your Credentials**:
   - Once deployed, go to your Speech Service resource
   - In the left menu, click "Keys and Endpoint"
   - Copy **Key 1** and note your **Region**

### Step 3: Configure the Extension
1. **Open Extension Popup**:
   - Click the extension icon in Chrome toolbar
   - Click "Configure Azure STT"

2. **Enter Credentials**:
   - **Azure Region**: Enter your region (e.g., `eastus`)
   - **API Key**: Paste your Azure Speech Service key
   - Click "Save"

### Step 4: Test the Setup
1. **Open Test Page**:
   - Open `test-azure-stt.html` in Chrome
   - Enter your Azure credentials
   - Click "Test Configuration"
   - If successful, try recording some audio

2. **Test on Google Meet**:
   - Go to [meet.google.com](https://meet.google.com)
   - Start or join a meeting
   - Look for the robot button (🤖) on the right
   - Click it to open the sidebar
   - Go to "Script" tab to see transcription

## 🎯 Detailed Setup Instructions

### Audio Capture Configuration

#### For Your Microphone (Automatic)
- The extension automatically captures your microphone
- Grant microphone permission when prompted
- Your speech will appear as "You" in the transcript

#### For Other Participants (Manual Setup)
1. **Method 1: Tab Sharing (Recommended)**:
   - When prompted, select "Chrome Tab"
   - **IMPORTANT**: Check "Share tab audio" checkbox
   - Click "Share"
   - Other participants' speech will appear as "Other Participant"

2. **Method 2: System Audio**:
   - If tab sharing doesn't work, try system audio
   - Select "System Audio" when prompted
   - This captures all system audio

3. **Method 3: Desktop Capture**:
   - Select your entire screen/desktop
   - Enable audio sharing
   - This captures everything on your screen

### Troubleshooting Audio Capture

#### "No audio captured for other participants"
1. **Check Screen Sharing**:
   - Ensure "Share tab audio" is checked
   - Try different sharing methods
   - Check browser console for errors

2. **Alternative Solutions**:
   - Use system audio capture
   - Try desktop sharing
   - Extension falls back to visual detection

#### "Microphone not working"
1. **Check Permissions**:
   - Go to Chrome settings → Privacy and security → Site settings
   - Find meet.google.com and ensure microphone is allowed
   - Check if microphone is used by other apps

2. **Browser Console**:
   - Press F12 to open developer tools
   - Look for microphone-related errors
   - Check if extension is properly loaded

### Azure STT Configuration Issues

#### "Azure STT not configured"
1. **Verify Azure Service**:
   - Check if Speech Service is active in Azure Portal
   - Ensure you have sufficient credits
   - Verify region and API key are correct

2. **Test Configuration**:
   - Use the test page (`test-azure-stt.html`)
   - Check browser console for detailed errors
   - Try re-entering credentials

#### "Transcription not working"
1. **Check Azure Response**:
   - Open browser console (F12)
   - Look for Azure STT error messages
   - Check network tab for failed requests

2. **Common Issues**:
   - Invalid API key
   - Wrong region
   - Service quota exceeded
   - Network connectivity issues

## 🔧 Advanced Configuration

### Manual Configuration via Console
Open browser console on Google Meet page and run:

```javascript
// Configure Azure STT
window.AgentAssistConfigureAzureSTT('your-region', 'your-api-key');

// Check configuration
console.log(window.agentAssist?.remoteTranscription);

// Test audio capture
console.log(window.agentAssist?.isStreaming);
```

### Custom Audio Settings
The extension uses these default settings:
- **Sample Rate**: 16kHz (optimized for Azure STT)
- **VAD Threshold**: 0.013 (voice activity detection)
- **Min Speech Duration**: 300ms
- **Max Segment Duration**: 8 seconds

### Language Support
Azure STT supports multiple languages. To change language:
1. Edit the `language` parameter in `content.js`
2. Set `this.remoteTranscription.language = 'es-ES';` for Spanish
3. Reload the extension

## 📊 Monitoring and Debugging

### Browser Console Commands
```javascript
// Check extension status
console.log(window.agentAssist);

// Check Azure STT status
console.log(window.agentAssist?.remoteTranscription);

// Check audio streams
console.log(window.agentAssist?.localMicStream);
console.log(window.agentAssist?.otherAudioStream);

// Force restart audio capture
window.agentAssist?.startLocalSpeechRecognition();
window.agentAssist?.startTabAudioCapture();
```

### Common Error Messages
- **"Azure STT not configured"**: Set up Azure Speech Service
- **"No audio captured"**: Check screen sharing settings
- **"Microphone access denied"**: Grant microphone permissions
- **"WebSocket connection failed"**: Legacy error, now uses Azure STT

## 🛡️ Security and Privacy

### Data Handling
- **Audio Processing**: Only when extension is active
- **Storage**: Credentials stored in Chrome sync storage
- **Transmission**: Audio sent directly to Azure STT
- **Retention**: No audio data stored locally

### Permissions Required
- **Microphone**: For your speech capture
- **Tab Capture**: For other participants' audio
- **Storage**: For saving Azure credentials
- **Active Tab**: For Google Meet integration

## 🆘 Support and Troubleshooting

### Getting Help
1. **Check Console Logs**: Press F12 and look for errors
2. **Test Azure STT**: Use the test page first
3. **Verify Permissions**: Check Chrome site settings
4. **Restart Extension**: Reload the extension in Chrome

### Common Solutions
1. **Extension not loading**: Check developer mode and file paths
2. **No sidebar**: Refresh Google Meet page
3. **No transcription**: Verify Azure STT configuration
4. **Audio issues**: Try different capture methods

### Performance Tips
1. **Close other audio apps**: Free up microphone
2. **Use wired headphones**: Better audio quality
3. **Stable internet**: Required for Azure STT
4. **Regular browser updates**: Ensure compatibility

---

## ✅ Setup Checklist

- [ ] Extension loaded in Chrome
- [ ] Azure Speech Service created
- [ ] Region and API key noted
- [ ] Extension configured with Azure credentials
- [ ] Test page working
- [ ] Google Meet sidebar appears
- [ ] Your microphone captured
- [ ] Other participants' audio captured
- [ ] Transcription working in Script tab

## 🎉 You're All Set!

Your Agent Assist extension is now fully configured with professional-grade Azure Speech-to-Text transcription. Enjoy enhanced Google Meet sessions with real-time transcription and insights!
