// Background service worker for Voice Form Filler
// Manages conversation state, API communication, and voice processing

class ConversationStateMachine {
  constructor() {
    this.states = {
      IDLE: 'IDLE',
      ANALYZING: 'ANALYZING',
      QUESTIONING: 'QUESTIONING',
      VALIDATING: 'VALIDATING',
      CORRECTING: 'CORRECTING',
      FILLING: 'FILLING',
      COMPLETED: 'COMPLETED',
      ERROR: 'ERROR'
    };
    
    this.currentState = this.states.IDLE;
    this.detectedFields = [];
    this.fieldResponses = {};
    this.currentFieldIndex = 0;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.apiUrl = 'http://localhost:8000';
    
    this.init();
  }

  init() {
    // Load saved API URL
    this.loadApiUrl();
    
    // Listen for messages from popup and content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      console.log('Voice Form Filler extension installed');
    });
  }

  async loadApiUrl() {
    const result = await chrome.storage.local.get(['apiUrl']);
    if (result.apiUrl) {
      this.apiUrl = result.apiUrl;
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'START_PROCESSING':
          await this.startProcessing(message.tabId, message.apiUrl);
          sendResponse({ success: true });
          break;

        case 'STOP_PROCESSING':
          await this.stopProcessing();
          sendResponse({ success: true });
          break;

        case 'CLEAR_DATA':
          await this.clearData();
          sendResponse({ success: true });
          break;

        case 'VOICE_RECORDING_COMPLETE':
          await this.processVoiceResponse(message.audioData, sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'FIELDS_DETECTED':
          this.detectedFields = message.fields;
          await this.startConversation();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      this.setState(this.states.ERROR);
      this.notifyPopup({
        type: 'ERROR',
        error: error.message
      });
      sendResponse({ success: false, error: error.message });
    }
  }

  async startProcessing(tabId, apiUrl) {
    console.log('Starting form processing...');
    this.apiUrl = apiUrl || this.apiUrl;
    
    this.setState(this.states.ANALYZING);
    this.notifyPopup({
      type: 'STATUS_UPDATE',
      status: 'Analyzing webpage for form fields...'
    });

    // Send message to content script to analyze page
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'ANALYZE_PAGE'
      });

      if (response && response.success) {
        this.detectedFields = response.fields;
        
        if (!this.detectedFields || this.detectedFields.length === 0) {
          throw new Error('No form fields detected on the page');
        }

        this.notifyPopup({
          type: 'FIELDS_DETECTED',
          fields: this.detectedFields.map(field => ({
            label: field.humanLabel,
            type: field.type,
            selector: field.selector
          }))
        });

        // Start the conversation
        await this.startConversation();
      } else {
        throw new Error(response?.error || 'Failed to analyze page');
      }
    } catch (error) {
      console.error('Failed to communicate with content script:', error);
      throw new Error('Failed to analyze webpage: ' + error.message);
    }
  }

  async startConversation() {
    console.log('Starting conversation with', this.detectedFields.length, 'fields');
    
    this.setState(this.states.QUESTIONING);
    this.currentFieldIndex = 0;
    this.fieldResponses = {};
    
    this.notifyPopup({
      type: 'CONVERSATION_STARTED',
      total: this.detectedFields.length
    });

    // Ask the first question
    await this.askCurrentQuestion();
  }

  async askCurrentQuestion() {
    if (this.currentState !== this.states.QUESTIONING && this.currentState !== this.states.CORRECTING) {
      return;
    }

    const field = this.detectedFields[this.currentFieldIndex];
    if (!field) {
      // All questions asked, move to validation
      await this.validateResponses();
      return;
    }

    const question = this.generateQuestion(field);
    
    this.notifyPopup({
      type: 'QUESTION_ASKED',
      current: this.currentFieldIndex + 1,
      total: this.detectedFields.length,
      question: question,
      field: field.humanLabel
    });

    // Convert question to speech
    await this.speakQuestion(question);
    
    // Start voice recording after speaking the question
    setTimeout(() => {
      this.startVoiceRecording();
    }, 1000);
  }

  async startVoiceRecording() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // Start recording in content script
      await chrome.tabs.sendMessage(tab.id, {
        type: 'START_VOICE_RECORDING'
      });
      
      console.log('Voice recording started');
      
      // Auto-stop recording after 8 seconds
      setTimeout(() => {
        this.stopVoiceRecording();
      }, 8000);
      
    } catch (error) {
      console.error('Failed to start voice recording:', error);
      this.notifyPopup({
        type: 'ERROR',
        error: 'Voice recording failed: ' + error.message
      });
    }
  }

  async stopVoiceRecording() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // Stop recording and get audio data
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'STOP_VOICE_RECORDING'
      });
      
      if (response && response.success && response.audioData) {
        await this.processVoiceResponse(response.audioData, tab);
      } else {
        throw new Error(response?.error || 'No audio data received');
      }
      
    } catch (error) {
      console.error('Failed to stop voice recording:', error);
      this.notifyPopup({
        type: 'ERROR',
        error: 'Voice processing failed: ' + error.message
      });
    }
  }

  generateQuestion(field) {
    const fieldType = field.type;
    const fieldLabel = field.humanLabel;
    
    // Generate contextual questions based on field type and label
    const questionTemplates = {
      'email': [
        `What is your email address for ${fieldLabel}?`,
        `Please provide your email for ${fieldLabel}`,
        `What email should I use for ${fieldLabel}?`
      ],
      'tel': [
        `What is your phone number for ${fieldLabel}?`,
        `Please provide your phone number for ${fieldLabel}`,
        `What phone number should I use for ${fieldLabel}?`
      ],
      'password': [
        `Please provide a password for ${fieldLabel}`,
        `What password would you like to use for ${fieldLabel}?`,
        `Please enter your password for ${fieldLabel}`
      ],
      'textarea': [
        `Please provide ${fieldLabel}`,
        `What would you like to enter for ${fieldLabel}?`,
        `Please describe ${fieldLabel}`
      ],
      'text': [
        `What is your ${fieldLabel}?`,
        `Please provide ${fieldLabel}`,
        `What should I enter for ${fieldLabel}?`
      ]
    };
    
    const templates = questionTemplates[fieldType] || questionTemplates['text'];
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    
    return randomTemplate;
  }

  async speakQuestion(text) {
    try {
      const response = await fetch(`${this.apiUrl}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          voice: 'alloy',
          speed: 1.0
        })
      });

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Play the audio in the content script context
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'PLAY_AUDIO',
            audioData: data.audio_data
          });
        }
      });

    } catch (error) {
      console.error('TTS error:', error);
      // Fallback to text-only if TTS fails
      this.notifyPopup({
        type: 'STATUS_UPDATE',
        status: `TTS failed, please read: ${text}`
      });
    }
  }

  async processVoiceResponse(audioData, tab) {
    console.log('Processing voice response...');
    
    try {
      // Create FormData for audio upload
      const formData = new FormData();
      const audioBlob = this.base64ToBlob(audioData, 'audio/webm');
      formData.append('file', audioBlob, 'response.webm');

      // Transcribe audio
      const response = await fetch(`${this.apiUrl}/transcribe`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const data = await response.json();
      const transcribedText = data.text;

      console.log('Transcribed text:', transcribedText);

      // Store the response
      const currentField = this.detectedFields[this.currentFieldIndex];
      this.fieldResponses[currentField.humanLabel] = {
        original: transcribedText,
        normalized: transcribedText,
        fieldType: currentField.type,
        fieldName: currentField.name,
        fieldId: currentField.id
      };

      this.notifyPopup({
        type: 'ANSWER_RECEIVED',
        current: this.currentFieldIndex + 1,
        total: this.detectedFields.length,
        field: currentField.humanLabel,
        answer: transcribedText
      });

      // Move to next field
      this.currentFieldIndex++;
      
      // Continue conversation or validate
      if (this.currentFieldIndex < this.detectedFields.length) {
        // Small delay before next question
        setTimeout(() => {
          this.askCurrentQuestion();
        }, 1000);
      } else {
        // All fields answered, validate responses
        await this.validateResponses();
      }

    } catch (error) {
      console.error('Voice processing error:', error);
      this.notifyPopup({
        type: 'ERROR',
        error: 'Failed to process voice response: ' + error.message
      });
      
      // Retry the current question
      this.retryCount++;
      if (this.retryCount <= this.maxRetries) {
        setTimeout(() => {
          this.askCurrentQuestion();
        }, 2000);
      } else {
        this.setState(this.states.ERROR);
      }
    }
  }

  async validateResponses() {
    console.log('Validating responses...');
    
    this.setState(this.states.VALIDATING);
    this.retryCount = 0;
    
    this.notifyPopup({
      type: 'VALIDATION_STARTED'
    });

    try {
      // Prepare validation request
      const fields = {};
      const fieldTypes = {};
      
      for (const [label, response] of Object.entries(this.fieldResponses)) {
        fields[label] = response.original;
        fieldTypes[label] = response.fieldType;
      }

      const validationRequest = {
        fields: fields,
        field_types: fieldTypes
      };

      const response = await fetch(`${this.apiUrl}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validationRequest)
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.status}`);
      }

      const validationResult = await response.json();
      
      // Update responses with normalized values
      for (const [fieldName, result] of Object.entries(validationResult.results)) {
        if (this.fieldResponses[fieldName]) {
          this.fieldResponses[fieldName].normalized = result.normalized || result.original;
          this.fieldResponses[fieldName].valid = result.valid;
          this.fieldResponses[fieldName].confidence = result.confidence;
          this.fieldResponses[fieldName].reason = result.reason;
          this.fieldResponses[fieldName].suggestions = result.suggestions;
        }
      }

      this.notifyPopup({
        type: 'VALIDATION_COMPLETED',
        valid: validationResult.all_valid,
        invalidCount: validationResult.invalid_count
      });

      if (validationResult.all_valid) {
        // All fields valid, fill the form
        await this.fillForm();
      } else {
        // Some fields invalid, enter correction mode
        await this.startCorrection(validationResult);
      }

    } catch (error) {
      console.error('Validation error:', error);
      this.notifyPopup({
        type: 'ERROR',
        error: 'Validation failed: ' + error.message
      });
      
      // Continue with original values as fallback
      await this.fillForm();
    }
  }

  async startCorrection(validationResult) {
    console.log('Starting correction for invalid fields');
    
    this.setState(this.states.CORRECTING);
    
    // Find invalid fields
    const invalidFields = [];
    for (const [fieldName, result] of Object.entries(validationResult.results)) {
      if (!result.valid) {
        const field = this.detectedFields.find(f => f.humanLabel === fieldName);
        if (field) {
          invalidFields.push({
            field: field,
            reason: result.reason,
            suggestions: result.suggestions
          });
        }
      }
    }

    // Reset to first invalid field
    this.currentFieldIndex = this.detectedFields.indexOf(invalidFields[0].field);
    
    // Ask again with correction guidance
    await this.askCurrentQuestion();
  }

  async fillForm() {
    console.log('Filling form with validated responses');
    
    this.setState(this.states.FILLING);
    
    this.notifyPopup({
      type: 'STATUS_UPDATE',
      status: 'Filling form with validated responses...'
    });

    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Prepare fill data
      const fillData = {};
      for (const [label, response] of Object.entries(this.fieldResponses)) {
        fillData[label] = {
          normalized: response.normalized,
          fieldName: response.fieldName,
          fieldId: response.fieldId
        };
      }

      // Send message to content script to fill form
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_FORM',
        responses: fillData
      });

      if (response && response.success) {
        this.setState(this.states.COMPLETED);
        this.notifyPopup({
          type: 'FORM_FILLED'
        });
      } else {
        throw new Error(response?.error || 'Form filling failed');
      }

    } catch (error) {
      console.error('Form filling error:', error);
      this.notifyPopup({
        type: 'ERROR',
        error: 'Failed to fill form: ' + error.message
      });
    }
  }

  async stopProcessing() {
    console.log('Stopping form processing');
    
    this.setState(this.states.IDLE);
    this.currentFieldIndex = 0;
    this.fieldResponses = {};
    this.retryCount = 0;
    
    this.notifyPopup({
      type: 'STATUS_UPDATE',
      status: 'Process stopped',
      state: 'stopped'
    });
  }

  async clearData() {
    console.log('Clearing all data');
    
    this.setState(this.states.IDLE);
    this.detectedFields = [];
    this.fieldResponses = {};
    this.currentFieldIndex = 0;
    this.retryCount = 0;
  }

  setState(newState) {
    console.log(`State transition: ${this.currentState} -> ${newState}`);
    this.currentState = newState;
  }

  notifyPopup(message) {
    // Send message to popup if it's open
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might not be open, silently ignore
    });
  }

  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

// Initialize the conversation state machine
const stateMachine = new ConversationStateMachine();

// Handle voice recording from content script
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'voice-recording') {
    port.onMessage.addListener((message) => {
      if (message.type === 'VOICE_RECORDING_COMPLETE') {
        stateMachine.processVoiceResponse(message.audioData, port.sender.tab.id);
      }
    });
  }
});