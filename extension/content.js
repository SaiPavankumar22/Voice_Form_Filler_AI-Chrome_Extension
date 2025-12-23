// Content script for Voice Form Filler extension
// Handles DOM analysis, form detection, autofill functionality, and voice operations

class FormAnalyzer {
  constructor() {
    this.detectedFields = [];
    this.fieldResponses = {};
    this.isProcessing = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.audioContext = null;
    this.init();
  }

  init() {
    // Listen for messages from background script
    // Use arrow function to preserve 'this' context
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Handle message asynchronously
      this.handleMessage(message, sender, sendResponse).catch(error => {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async responses
    });

    // Inject additional scripts if needed
    this.injectScripts();
    
    // Initialize audio context for playback
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Audio context initialization failed:', error);
    }
  }

  injectScripts() {
    // Inject any additional scripts that need to run in page context
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'ANALYZE_PAGE':
          const fields = await this.analyzePage();
          sendResponse({ success: true, fields });
          break;

        case 'FILL_FORM':
          const result = await this.fillForm(message.responses);
          sendResponse({ success: result });
          break;

        case 'GET_PAGE_INFO':
          const info = this.getPageInfo();
          sendResponse({ success: true, info });
          break;
          
        case 'START_VOICE_RECORDING':
          await this.startVoiceRecording();
          sendResponse({ success: true });
          break;
          
        case 'STOP_VOICE_RECORDING':
          const audioData = await this.stopVoiceRecording();
          sendResponse({ success: true, audioData });
          break;
          
        case 'PLAY_AUDIO':
          await this.playAudio(message.audioData);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Content script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async analyzePage() {
    console.log('Analyzing page for form fields...');
    
    // Reset detected fields
    this.detectedFields = [];
    
    // Find all forms on the page
    const forms = document.querySelectorAll('form');
    const allFields = [];
    
    if (forms.length === 0) {
      // If no forms found, look for standalone inputs
      const standaloneInputs = this.findStandaloneInputs();
      allFields.push(...standaloneInputs);
    } else {
      // Analyze each form
      forms.forEach((form, formIndex) => {
        const formFields = this.analyzeForm(form, formIndex);
        allFields.push(...formFields);
      });
    }

    // Remove duplicates based on element identity
    const uniqueFields = this.deduplicateFields(allFields);
    
    // Sort fields by position in DOM (top to bottom, left to right)
    this.detectedFields = this.sortFieldsByPosition(uniqueFields);
    
    console.log(`Found ${this.detectedFields.length} form fields`);
    return this.detectedFields;
  }

  findStandaloneInputs() {
    const inputs = [];
    const selectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="password"]',
      'textarea:not(form textarea)' // Only textareas not inside forms
    ];
    
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!this.isInsideForm(element)) {
          const fieldInfo = this.extractFieldInfo(element);
          if (fieldInfo) {
            inputs.push(fieldInfo);
          }
        }
      });
    });
    
    return inputs;
  }

  isInsideForm(element) {
    let parent = element.parentElement;
    while (parent) {
      if (parent.tagName === 'FORM') {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  analyzeForm(form, formIndex) {
    const fields = [];
    
    // Find all relevant input elements within the form
    const selectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="password"]',
      'textarea'
    ];
    
    selectors.forEach(selector => {
      const elements = form.querySelectorAll(selector);
      elements.forEach(element => {
        const fieldInfo = this.extractFieldInfo(element, formIndex);
        if (fieldInfo) {
          fields.push(fieldInfo);
        }
      });
    });
    
    return fields;
  }

  extractFieldInfo(element, formIndex = 0) {
    try {
      // Skip hidden elements
      if (element.type === 'hidden' || element.style.display === 'none' || 
          element.style.visibility === 'hidden' || element.offsetParent === null) {
        return null;
      }

      // Skip disabled elements
      if (element.disabled) {
        return null;
      }

      const fieldInfo = {
        element: element,
        selector: this.generateSelector(element),
        tagName: element.tagName.toLowerCase(),
        type: element.type || element.tagName.toLowerCase(),
        id: element.id || '',
        name: element.name || '',
        placeholder: element.placeholder || '',
        ariaLabel: element.getAttribute('aria-label') || '',
        label: this.findAssociatedLabel(element),
        nearbyText: this.findNearbyText(element),
        formIndex: formIndex,
        position: this.getElementPosition(element)
      };

      // Generate human-readable label
      fieldInfo.humanLabel = this.generateHumanLabel(fieldInfo);
      
      return fieldInfo;
    } catch (error) {
      console.error('Error extracting field info:', error);
      return null;
    }
  }

  generateSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.name) {
      return `[name="${element.name}"]`;
    }
    
    // Generate a unique selector based on element path
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }
      
      if (current.className) {
        const classes = current.className.split(' ').filter(c => c.trim());
        if (classes.length > 0) {
          selector += '.' + classes.join('.');
        }
      }
      
      // Add nth-child if needed
      const siblings = Array.from(current.parentElement?.children || []);
      const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.join(' > ');
  }

  findAssociatedLabel(element) {
    // Method 1: Direct label association
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        return label.textContent.trim();
      }
    }
    
    // Method 2: Parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      // Get text content but exclude other form elements
      let text = '';
      parentLabel.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node === element) {
          return; // Stop at the input element
        }
      });
      return text.trim();
    }
    
    // Method 3: Nearby labels or text
    const nearbyElements = this.getNearbyElements(element, 'label, span, div');
    for (const nearby of nearbyElements) {
      const text = nearby.textContent?.trim();
      if (text && text.length > 0 && text.length < 100) {
        return text;
      }
    }
    
    return '';
  }

  findNearbyText(element, maxDistance = 50) {
    const elementRect = element.getBoundingClientRect();
    const nearbyTexts = [];
    
    // Get all text nodes in the document
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let textNode;
    while (textNode = walker.nextNode()) {
      const parent = textNode.parentElement;
      if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
        continue;
      }
      
      const text = textNode.textContent.trim();
      if (text.length > 0 && text.length < 200) {
        const parentRect = parent.getBoundingClientRect();
        const distance = this.calculateDistance(elementRect, parentRect);
        
        if (distance < maxDistance) {
          nearbyTexts.push({ text, distance });
        }
      }
    }
    
    // Sort by distance and return the closest ones
    nearbyTexts.sort((a, b) => a.distance - b.distance);
    return nearbyTexts.slice(0, 3).map(item => item.text).join(' ');
  }

  getNearbyElements(element, selector, maxDistance = 100) {
    const elementRect = element.getBoundingClientRect();
    const nearbyElements = [];
    
    document.querySelectorAll(selector).forEach(other => {
      if (other === element || other.contains(element)) {
        return;
      }
      
      const otherRect = other.getBoundingClientRect();
      const distance = this.calculateDistance(elementRect, otherRect);
      
      if (distance < maxDistance) {
        nearbyElements.push({ element: other, distance });
      }
    });
    
    nearbyElements.sort((a, b) => a.distance - b.distance);
    return nearbyElements.map(item => item.element);
  }

  calculateDistance(rect1, rect2) {
    const centerX1 = rect1.left + rect1.width / 2;
    const centerY1 = rect1.top + rect1.height / 2;
    const centerX2 = rect2.left + rect2.width / 2;
    const centerY2 = rect2.top + rect2.height / 2;
    
    return Math.sqrt(Math.pow(centerX2 - centerX1, 2) + Math.pow(centerY2 - centerY1, 2));
  }

  getElementPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      top: rect.top,
      left: rect.left
    };
  }

  generateHumanLabel(fieldInfo) {
    // Priority order for generating human-readable labels
    const sources = [
      fieldInfo.label,
      fieldInfo.placeholder,
      fieldInfo.ariaLabel,
      fieldInfo.name,
      fieldInfo.id,
      fieldInfo.nearbyText
    ];
    
    for (const source of sources) {
      if (source && source.trim().length > 0) {
        return this.cleanLabel(source);
      }
    }
    
    // Fallback based on field type
    const typeLabels = {
      'text': 'Text Field',
      'email': 'Email Address',
      'tel': 'Phone Number',
      'password': 'Password',
      'textarea': 'Text Area'
    };
    
    return typeLabels[fieldInfo.type] || 'Input Field';
  }

  cleanLabel(text) {
    return text
      .replace(/[^\w\s-]/g, ' ') // Replace special chars with spaces
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .trim()
      .replace(/^[^a-zA-Z]+/, '') // Remove leading non-letters
      .replace(/[^a-zA-Z0-9]+$/, '') // Remove trailing non-alphanumeric
      .trim();
  }

  deduplicateFields(fields) {
    const seen = new WeakSet();
    return fields.filter(field => {
      if (seen.has(field.element)) {
        return false;
      }
      seen.add(field.element);
      return true;
    });
  }

  sortFieldsByPosition(fields) {
    return fields.sort((a, b) => {
      // First sort by form index
      if (a.formIndex !== b.formIndex) {
        return a.formIndex - b.formIndex;
      }
      
      // Then sort by vertical position (top to bottom)
      if (Math.abs(a.position.top - b.position.top) > 20) {
        return a.position.top - b.position.top;
      }
      
      // Finally sort by horizontal position (left to right)
      return a.position.left - b.position.left;
    });
  }

  async fillForm(responses) {
    console.log('Filling form with responses:', responses);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const field of this.detectedFields) {
      const response = responses[field.humanLabel] || responses[field.name] || responses[field.id];
      
      if (response && response.normalized !== undefined) {
        try {
          const filled = this.fillField(field.element, response.normalized);
          if (filled) {
            successCount++;
            console.log(`Filled field "${field.humanLabel}" with value:`, response.normalized);
          } else {
            errorCount++;
            console.warn(`Failed to fill field "${field.humanLabel}"`);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error filling field "${field.humanLabel}":`, error);
        }
      } else {
        console.warn(`No response found for field: ${field.humanLabel}`);
        errorCount++;
      }
    }
    
    console.log(`Form filling completed: ${successCount} successful, ${errorCount} errors`);
    return errorCount === 0;
  }

  fillField(element, value) {
    try {
      // Focus the element
      element.focus();
      
      // Set the value
      element.value = value;
      
      // Trigger necessary events for React/Angular compatibility
      this.triggerEvent(element, 'input');
      this.triggerEvent(element, 'change');
      
      // For React, we need to manually update the value property
      // and trigger the onChange handler if it exists
      if (element._valueTracker) {
        element._valueTracker.setValue(value);
      }
      
      // Blur the element to trigger validation
      element.blur();
      
      return true;
    } catch (error) {
      console.error('Error filling field:', error);
      return false;
    }
  }

  triggerEvent(element, eventType) {
    try {
      const event = new Event(eventType, {
        bubbles: true,
        cancelable: true,
        composed: true
      });
      element.dispatchEvent(event);
    } catch (error) {
      console.warn(`Failed to trigger ${eventType} event:`, error);
    }
  }

  getPageInfo() {
    return {
      url: window.location.href,
      title: document.title,
      forms: document.querySelectorAll('form').length,
      inputs: document.querySelectorAll('input, textarea').length,
      timestamp: new Date().toISOString()
    };
  }

  // Voice Recording and Playback Methods
  async startVoiceRecording() {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    try {
      // Request microphone permission and get stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        this.isRecording = true;
        console.log('Voice recording started');
        
        // Visual feedback
        this.showRecordingIndicator();
      };

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        stream.getTracks().forEach(track => track.stop());
        console.log('Voice recording stopped');
        
        // Hide visual feedback
        this.hideRecordingIndicator();
      };

      // Start recording
      this.mediaRecorder.start();
      
      // Auto-stop after 10 seconds to prevent infinite recording
      setTimeout(() => {
        if (this.isRecording) {
          this.stopVoiceRecording();
        }
      }, 10000);

    } catch (error) {
      console.error('Failed to start voice recording:', error);
      throw new Error('Microphone access denied or not available');
    }
  }

  async stopVoiceRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('No active recording');
    }

    return new Promise((resolve, reject) => {
      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        
        if (this.audioChunks.length === 0) {
          reject(new Error('No audio data recorded'));
          return;
        }

        // Combine chunks into a single blob
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Convert to base64 for transmission
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = () => {
          reject(new Error('Failed to convert audio to base64'));
        };
        reader.readAsDataURL(audioBlob);
        
        // Clean up
        this.audioChunks = [];
        this.mediaRecorder = null;
      };

      this.mediaRecorder.stop();
    });
  }

  async playAudio(base64AudioData) {
    if (!this.audioContext) {
      this.initAudioContext();
    }

    if (!this.audioContext) {
      throw new Error('Audio context not available');
    }

    try {
      // Resume audio context if suspended (required by browser autoplay policies)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64AudioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode and play audio
      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create gain node for volume control
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 0.8; // 80% volume
      
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Play audio
      source.start();
      
      console.log('Audio playback started');
      
      // Return promise that resolves when audio finishes
      return new Promise((resolve) => {
        source.onended = () => {
          console.log('Audio playback completed');
          resolve();
        };
      });

    } catch (error) {
      console.error('Audio playback failed:', error);
      throw new Error('Failed to play audio: ' + error.message);
    }
  }

  showRecordingIndicator() {
    // Create recording indicator
    const indicator = document.createElement('div');
    indicator.id = 'voice-form-filler-recording-indicator';
    indicator.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(244, 67, 54, 0.9);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        animation: pulse 1.5s infinite;
      ">
        <div style="
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: pulse-dot 1s infinite;
        "></div>
        🎤 Recording... Speak now
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>
    `;
    
    document.body.appendChild(indicator);
  }

  hideRecordingIndicator() {
    const indicator = document.getElementById('voice-form-filler-recording-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // Voice-triggered form filling (for future enhancement)
  async startVoiceDrivenFilling() {
    // This method would integrate with the background script
    // to coordinate voice recording with the conversation flow
    console.log('Starting voice-driven form filling');
    
    // Notify background script to start the process
    chrome.runtime.sendMessage({
      type: 'START_VOICE_DRIVEN_FILLING'
    });
  }
}

// Initialize the form analyzer
const formAnalyzer = new FormAnalyzer();

// Export class and instance for use in other scripts
window.FormAnalyzer = FormAnalyzer;
window.formAnalyzer = formAnalyzer;