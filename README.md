# Voice Form Filler AI - Chrome Extension

A production-grade Chrome Extension with backend AI service that enables conversational, voice-driven form filling on any webpage.

## 🌟 Features

- **Voice-Driven**: Speak your responses naturally
- **AI-Powered**: Uses OpenAI Whisper, GPT-4o-mini, and TTS models
- **Universal Compatibility**: Works on any webpage with text inputs
- **Smart Validation**: Batch validation with confidence scores
- **Framework Agnostic**: Works with React, Angular, Vue, and vanilla JS forms
- **Privacy-First**: No audio storage, temporary data only
- **State Machine**: Deterministic conversation flow

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chrome        │    │   Background     │    │   Backend       │
│   Extension     │────│   Service Worker │────│   FastAPI       │
│                 │    │                  │    │   Service       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    ┌────────┐              ┌─────────┐              ┌─────────┐
    │ Popup  │              │ Content │              │ OpenAI  │
    │  UI    │              │ Script  │              │   APIs  │
    └────────┘              └─────────┘              └─────────┘
```

## 📋 Requirements

- **Chrome Browser**: Version 88+
- **Python**: 3.8+
- **OpenAI API Key**: Access to Whisper, GPT-4o-mini, and TTS models
- **Microphone**: For voice input

## 🚀 Quick Start

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your OpenAI API key

# Start the server
python main.py
```

The backend will start on `http://localhost:8000`

### 2. Extension Setup

```bash
# Navigate to extension directory
cd extension

# Load extension in Chrome:
# 1. Open Chrome → Settings → Extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the `extension` folder
```

### 3. Test the System

1. Open `test.html` in Chrome
2. Click the extension icon
3. Click "Process Webpage"
4. Answer voice prompts for each field
5. Watch the form fill automatically!

## 🔧 Configuration

### Backend Configuration (.env)

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
HOST=0.0.0.0
PORT=8000

# Model Configuration
WHISPER_MODEL=whisper-1
CHATGPT_MODEL=gpt-4o-mini
TTS_MODEL=tts-1
TTS_VOICE=alloy
```

### Extension Configuration

The extension API URL can be configured through the popup UI or by setting:
- Default: `http://localhost:8000`
- Configure in popup settings or Chrome storage

## 🎯 How It Works

### 1. Form Detection
- Scans webpage for text-based inputs
- Extracts semantic meaning from labels, placeholders, and nearby text
- Ignores radio buttons, dropdowns, checkboxes, and file uploads

### 2. Voice Conversation
- Asks one question per detected field
- Records user voice responses
- Transcribes using OpenAI Whisper
- Speaks questions using OpenAI TTS

### 3. Batch Validation
- Validates all responses after collection
- Normalizes spoken words ("dot" → ".", "at" → "@")
- Validates format (email, phone, etc.)
- Returns confidence scores and error reasons

### 4. Form Filling
- Automatically fills validated data
- Triggers proper events for React/Angular compatibility
- Focus → Set Value → Input Event → Change Event → Blur

## 🏛️ State Machine

```
IDLE → ANALYZING → QUESTIONING → VALIDATING → FILLING → COMPLETED
                    ↓              ↓
                CORRECTING ← INVALID_FIELDS
```

## 🔌 API Endpoints

### POST /transcribe
Transcribe audio to text using Whisper

```json
// Request: multipart/form-data with audio file
// Response:
{
  "text": "transcribed text",
  "confidence": 0.95,
  "language": "en"
}
```

### POST /validate
Validate and normalize form field values

```json
// Request:
{
  "fields": { "email": "john at example dot com" },
  "field_types": { "email": "email" }
}

// Response:
{
  "results": {
    "email": {
      "normalized": "john@example.com",
      "valid": true,
      "confidence": 0.93,
      "reason": null,
      "suggestions": []
    }
  },
  "all_valid": true,
  "invalid_count": 0
}
```

### POST /tts
Convert text to speech

```json
// Request:
{
  "text": "What is your email address?",
  "voice": "alloy",
  "speed": 1.0
}

// Response:
{
  "audio_data": "base64_encoded_audio",
  "format": "mp3"
}
```

## 🧪 Testing

### Unit Tests
```bash
# Test form detection
python -m pytest tests/test_form_analyzer.py

# Test validation pipeline
python -m pytest tests/test_validation.py

# Test voice processing
python -m pytest tests/test_voice.py
```

### Integration Tests
```bash
# Test end-to-end workflow
npm run test:e2e

# Test with different frameworks
npm run test:react
npm run test:angular
npm run test:vue
```

### Manual Testing
1. Test with simple HTML forms
2. Test with React forms (CRA, Next.js)
3. Test with Angular forms
4. Test with dynamic forms
5. Test error scenarios

## 🔒 Security & Privacy

### Permissions Required
- `activeTab`: Access current tab content
- `storage`: Store extension settings
- `background`: Service worker persistence
- `scripting`: Execute content scripts
- `microphone`: Voice recording (requested at runtime)

### Data Handling
- No raw audio storage
- Temporary conversation data only
- No persistent user data storage
- All data cleared after session
- API keys stored securely in backend

### Best Practices
- Input validation on all endpoints
- CORS configuration
- Error handling without data exposure
- Environment variable protection

## 🚀 Deployment

### Backend Deployment

#### Docker (Recommended)
```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8000
CMD ["python", "main.py"]
```

```bash
docker build -t voice-form-filler-api .
docker run -p 8000:8000 --env-file .env voice-form-filler-api
```

#### Cloud Deployment
- **Heroku**: `git push heroku main`
- **AWS**: Use Elastic Beanstalk or ECS
- **Google Cloud**: App Engine or Cloud Run
- **Azure**: App Service or Container Instances

### Extension Distribution

#### Chrome Web Store
1. Create developer account
2. Zip extension folder
3. Upload to Chrome Web Store
4. Fill out store listing
5. Submit for review

#### Private Distribution
1. Package extension as `.crx`
2. Distribute with installation instructions
3. Users load as unpacked extension

## 🛠️ Development

### Project Structure
```
voice-form-filler/
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── requirements.txt
│   └── .env.example
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── background.js
│   ├── content.js
│   └── injected.js
├── test.html
└── README.md
```

### Debugging
- **Extension**: Chrome DevTools → Extensions → Inspect views
- **Background**: chrome://extensions → Service Worker → Inspect
- **Content**: Regular page DevTools → Sources → Content scripts
- **Backend**: Python logging and FastAPI debug mode

### Development Workflow
1. Make changes to extension files
2. Reload extension in Chrome
3. Test with `test.html`
4. Check console for errors
5. Use Chrome DevTools for debugging

## 🔄 Troubleshooting

### Common Issues

#### "No form fields detected"
- Ensure page has text inputs (not radio/checkbox/dropdown)
- Check if inputs are visible (not hidden)
- Verify extension has permission for the page

#### "Microphone access denied"
- Grant microphone permission when prompted
- Check browser settings → Privacy → Microphone
- Ensure HTTPS (required for microphone access)

#### "API connection failed"
- Verify backend is running on correct URL
- Check API URL in extension popup settings
- Ensure no firewall blocking the connection

#### "Form not filling correctly"
- Check browser console for errors
- Verify React/Angular detection is working
- Ensure proper event triggering

### Debug Mode
Enable debug logging:
```javascript
// In extension console
localStorage.setItem('voiceFormFillerDebug', 'true');
```

## 📈 Performance

### Optimization Tips
- Use Web Workers for heavy processing
- Implement audio compression
- Cache validation rules
- Batch API requests when possible
- Use efficient DOM selectors

### Benchmarks
- Form analysis: ~50ms for 10 fields
- Voice transcription: ~2-3 seconds
- Validation: ~1-2 seconds
- Form filling: ~100ms for 10 fields

## 🔄 Future Enhancements

### Planned Features
- **Dropdown support**: Voice selection from options
- **Checkbox/Radio support**: Boolean voice responses
- **Multi-language**: Internationalization support
- **Profile memory**: Remember user preferences
- **Offline mode**: Local validation fallback
- **Advanced validation**: Custom rules and regex
- **Batch processing**: Multiple forms at once
- **Export/Import**: Save form configurations

### Contributing
1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Submit pull request
5. Code review and merge

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Support

- **Documentation**: This README
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@voiceformfiller.com

## 🙏 Acknowledgments

- OpenAI for Whisper, GPT, and TTS models
- Chrome Extensions team for the platform
- FastAPI for the excellent web framework
- All contributors and testers

---

**Built with ❤️ by the Voice Form Filler team**