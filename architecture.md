# Voice-Driven Form Filler - System Architecture

## Overview
A Chrome Extension with backend AI service that enables conversational, voice-driven form filling on any webpage.

## System Components

### 1. Chrome Extension (Frontend)
**Location**: `/extension`

#### 1.1 Manifest V3 Configuration
- `manifest.json`: Extension configuration and permissions
- Service worker for background processing
- Content scripts for DOM manipulation
- Popup UI for user interaction

#### 1.2 Content Script (`content.js`)
**Responsibilities**:
- Scan webpage for text-based input fields
- Extract semantic meaning from form fields
- Communicate with background service worker
- Autofill form fields with proper event triggering
- Handle DOM analysis and field detection

**Field Detection Logic**:
- `input[type="text"]`
- `input[type="email"]`
- `input[type="tel"]`
- `input[type="password"]`
- `textarea`

**Semantic Extraction**:
- Associated `<label>` elements
- `placeholder` attribute
- `aria-label` attribute
- `name` and `id` attributes
- Nearby DOM text content

#### 1.3 Background Service Worker (`background.js`)
**Responsibilities**:
- Coordinate between popup, content script, and backend API
- Manage conversation state machine
- Handle voice recording and playback
- Communicate with backend APIs
- Store temporary conversation data

#### 1.4 Popup UI (`popup.html` + `popup.js`)
**Responsibilities**:
- "Process Webpage" button to initiate form analysis
- Display conversation status and progress
- Show validation results and errors
- User-friendly interface for extension control

### 2. Backend API Service
**Location**: `/backend`
**Technology**: FastAPI (Python)

#### 2.1 API Endpoints

##### `/transcribe` (POST)
- **Input**: Audio file (webm/opus format)
- **Processing**: OpenAI Whisper-mini STT
- **Output**: Transcribed text
- **Headers**: `Content-Type: multipart/form-data`

##### `/validate` (POST)
- **Input**: JSON with field data and types
- **Processing**: OpenAI chatgpt-mini-o4 validation
- **Output**: Structured validation results with confidence scores
- **Headers**: `Content-Type: application/json`

##### `/tts` (POST)
- **Input**: JSON with text to synthesize
- **Processing**: OpenAI gpt-4o-mini-tts
- **Output**: Audio file (mp3 format)
- **Headers**: `Content-Type: application/json`

#### 2.2 Core Dependencies
```python
fastapi==0.104.1
python-multipart==0.0.6
openai==1.3.7
python-dotenv==1.0.0
uvicorn==0.24.0
```

### 3. Conversation State Machine
**Location**: Extension background script

#### 3.1 States
1. **IDLE**: Initial state, waiting for user action
2. **ANALYZING**: Scanning webpage for form fields
3. **QUESTIONING**: Asking user questions voice-to-voice
4. **VALIDATING**: Batch validation of collected responses
5. **CORRECTING**: Re-asking invalid fields
6. **FILLING**: Autofilling validated data into form
7. **COMPLETED**: Form filling completed successfully

#### 3.2 State Transitions
- IDLE → ANALYZING: User clicks "Process Webpage"
- ANALYZING → QUESTIONING: Form fields detected
- QUESTIONING → VALIDATING: All questions answered
- VALIDATING → CORRECTING: Some fields invalid
- CORRECTING → VALIDATING: Re-answered invalid fields
- VALIDATING → FILLING: All fields valid
- FILLING → COMPLETED: Form autofilled successfully

### 4. Voice Processing Pipeline

#### 4.1 Recording Flow
1. Extension requests microphone permission
2. User speaks response to question
3. Audio recorded as webm/opus format
4. Audio sent to backend `/transcribe` endpoint
5. Transcribed text returned to extension

#### 4.2 Playback Flow
1. Extension sends question text to backend `/tts`
2. Backend generates audio file
3. Extension plays audio to user
4. User hears the question and can respond

### 5. Validation Pipeline

#### 5.1 Batch Validation Process
1. Collect all user responses
2. Send to `/validate` endpoint with field types
3. Receive validation results with:
   - Normalized values
   - Validity status
   - Confidence scores
   - Error reasons for invalid fields

#### 5.2 Validation Rules
- **Email**: Format validation, normalize spoken characters
- **Phone**: Length validation, digit count
- **Text**: Length and content appropriateness
- **Password**: Strength validation (if applicable)

### 6. Autofill System

#### 6.1 Event Triggering
Proper event sequence for React/Angular compatibility:
1. `focus()` - Focus the input field
2. `input.value = normalizedValue` - Set the value
3. `input.dispatchEvent(new Event('input', { bubbles: true }))` - Trigger input event
4. `input.dispatchEvent(new Event('change', { bubbles: true }))` - Trigger change event
5. `input.blur()` - Remove focus

#### 6.2 Field Mapping
- Map validation results back to original DOM elements
- Maintain field order and structure
- Handle nested forms and dynamic content

## Data Flow

### 1. Form Analysis Flow
```
User → Popup "Process Webpage" → Background → Content Script → DOM Analysis → Field List → Background → Backend (optional) → User
```

### 2. Conversation Flow
```
Background → TTS Question → User → Voice Recording → Backend Transcribe → Background → Store Response → Next Question → (repeat) → Validation
```

### 3. Validation Flow
```
Background → Send All Responses → Backend Validate → Return Results → Background → Check Validity → Autofill/Correction
```

### 4. Autofill Flow
```
Background → Send Validated Data → Content Script → DOM Injection → Event Triggering → Form Filled → User Review
```

## Security & Privacy

### 1. Permissions Required
- `activeTab`: Access current tab content
- `storage`: Store extension settings
- `background`: Service worker persistence
- `scripting`: Execute content scripts
- `microphone`: Voice recording (requested at runtime)

### 2. Data Handling
- No raw audio storage
- Temporary conversation data only
- No persistent user data storage
- All data cleared after session

### 3. API Security
- Environment variables for OpenAI API keys
- Input validation on all endpoints
- Error handling without data exposure

## Error Handling

### 1. Extension Errors
- Network connectivity issues
- API rate limiting
- Microphone permission denied
- DOM manipulation failures

### 2. Backend Errors
- OpenAI API failures
- Audio processing errors
- Validation service unavailable
- Invalid input formats

### 3. User Feedback
- Clear error messages in popup
- Status indicators for each step
- Retry mechanisms for failed operations

## Testing Strategy

### 1. Unit Tests
- DOM analysis logic
- Conversation state machine
- API communication
- Validation rules

### 2. Integration Tests
- End-to-end form filling workflow
- Voice recording and playback
- Backend API integration
- Cross-browser compatibility

### 3. Test Forms
- Simple HTML forms
- React forms (CRA, Next.js)
- Angular forms
- Dynamic forms with JavaScript

## Deployment

### 1. Backend Deployment
- Docker containerization
- Environment configuration
- API key management
- Health monitoring

### 2. Extension Distribution
- Chrome Web Store submission
- Private distribution (optional)
- Installation instructions
- User documentation

This architecture ensures a clean, maintainable, and extensible system that meets all requirements while providing a smooth user experience.