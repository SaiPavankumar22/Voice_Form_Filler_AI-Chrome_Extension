// Popup script for Voice Form Filler extension
class PopupController {
  constructor() {
    this.elements = {
      statusText: document.getElementById('statusText'),
      processBtn: document.getElementById('processBtn'),
      stopBtn: document.getElementById('stopBtn'),
      clearBtn: document.getElementById('clearBtn'),
      progressContainer: document.getElementById('progressContainer'),
      progressText: document.getElementById('progressText'),
      progressFill: document.getElementById('progressFill'),
      fieldList: document.getElementById('fieldList'),
      fieldItems: document.getElementById('fieldItems'),
      errorMessage: document.getElementById('errorMessage'),
      successMessage: document.getElementById('successMessage'),
      apiUrl: document.getElementById('apiUrl')
    };
    
    this.init();
  }
  
  init() {
    // Load saved API URL
    this.loadApiUrl();
    
    // Bind event listeners
    this.elements.processBtn.addEventListener('click', () => this.processWebpage());
    this.elements.stopBtn.addEventListener('click', () => this.stopProcess());
    this.elements.clearBtn.addEventListener('click', () => this.clearData());
    this.elements.apiUrl.addEventListener('change', () => this.saveApiUrl());
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message);
    });
    
    // Update status on popup open
    this.updateStatus();
  }
  
  async loadApiUrl() {
    const result = await chrome.storage.local.get(['apiUrl']);
    if (result.apiUrl) {
      this.elements.apiUrl.value = result.apiUrl;
    }
  }
  
  async saveApiUrl() {
    const url = this.elements.apiUrl.value.trim();
    await chrome.storage.local.set({ apiUrl: url });
    
    // Notify background script of API URL change
    chrome.runtime.sendMessage({
      type: 'API_URL_CHANGED',
      apiUrl: url
    });
  }
  
  async processWebpage() {
    try {
      this.hideMessages();
      this.updateStatus('Analyzing webpage for form fields...', 'analyzing');
      
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }
      
      // Send process command to content script via background
      chrome.runtime.sendMessage({
        type: 'START_PROCESSING',
        tabId: tab.id,
        apiUrl: this.elements.apiUrl.value.trim()
      });
      
    } catch (error) {
      this.showError('Failed to start processing: ' + error.message);
      this.updateStatus('Ready to process webpage', 'ready');
    }
  }
  
  async stopProcess() {
    try {
      chrome.runtime.sendMessage({ type: 'STOP_PROCESSING' });
      this.updateStatus('Process stopped', 'stopped');
      this.toggleButtons(false);
    } catch (error) {
      this.showError('Failed to stop process: ' + error.message);
    }
  }
  
  async clearData() {
    try {
      chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
      this.hideMessages();
      this.updateStatus('Data cleared', 'cleared');
      this.hideProgress();
      this.hideFieldList();
      setTimeout(() => {
        this.updateStatus('Ready to process webpage', 'ready');
      }, 1500);
    } catch (error) {
      this.showError('Failed to clear data: ' + error.message);
    }
  }
  
  handleMessage(message) {
    switch (message.type) {
      case 'FIELDS_DETECTED':
        this.showFieldList(message.fields);
        this.updateStatus(`Found ${message.fields.length} form field(s)`, 'fields_detected');
        break;
        
      case 'CONVERSATION_STARTED':
        this.updateStatus('Conversation started - listening for responses', 'conversation_started');
        this.showProgress(message.current, message.total);
        this.toggleButtons(true);
        break;
        
      case 'QUESTION_ASKED':
        this.updateStatus(`Question ${message.current} of ${message.total}: ${message.question}`, 'asking_question');
        this.showProgress(message.current, message.total);
        break;
        
      case 'ANSWER_RECEIVED':
        this.updateStatus(`Answer received for: ${message.field}`, 'answer_received');
        this.showProgress(message.current, message.total);
        break;
        
      case 'VALIDATION_STARTED':
        this.updateStatus('Validating all responses...', 'validating');
        break;
        
      case 'VALIDATION_COMPLETED':
        if (message.valid) {
          this.updateStatus('All responses validated successfully', 'validation_success');
          this.showSuccess('Validation completed! Filling form...');
        } else {
          this.updateStatus('Some fields need correction', 'validation_errors');
          this.showError(`${message.invalidCount} field(s) need correction`);
        }
        break;
        
      case 'FORM_FILLED':
        this.updateStatus('Form filled successfully!', 'completed');
        this.showSuccess('Form filled successfully! Please review and submit.');
        this.toggleButtons(false);
        break;
        
      case 'ERROR':
        this.showError(message.error);
        this.updateStatus('Error occurred', 'error');
        this.toggleButtons(false);
        break;
        
      case 'STATUS_UPDATE':
        this.updateStatus(message.status, message.state);
        break;
    }
  }
  
  updateStatus(text, state = 'ready') {
    this.elements.statusText.textContent = text;
    
    // Add state-specific styling
    const statusContainer = this.elements.statusText.parentElement;
    statusContainer.className = 'status';
    
    if (state === 'error' || state === 'validation_errors') {
      statusContainer.style.background = 'rgba(244, 67, 54, 0.2)';
    } else if (state === 'completed' || state === 'validation_success') {
      statusContainer.style.background = 'rgba(76, 175, 80, 0.2)';
    } else if (state === 'analyzing' || state === 'validating') {
      statusContainer.style.background = 'rgba(255, 193, 7, 0.2)';
    } else {
      statusContainer.style.background = 'rgba(255, 255, 255, 0.1)';
    }
  }
  
  showProgress(current, total) {
    this.elements.progressContainer.classList.remove('hidden');
    this.elements.progressText.textContent = `${current} of ${total} fields completed`;
    const percentage = total > 0 ? (current / total) * 100 : 0;
    this.elements.progressFill.style.width = `${percentage}%`;
  }
  
  hideProgress() {
    this.elements.progressContainer.classList.add('hidden');
  }
  
  showFieldList(fields) {
    this.elements.fieldList.classList.remove('hidden');
    this.elements.fieldItems.innerHTML = '';
    
    fields.forEach((field, index) => {
      const item = document.createElement('div');
      item.className = 'field-item';
      item.textContent = `${index + 1}. ${field.label || field.name || field.id || 'Unknown Field'}`;
      this.elements.fieldItems.appendChild(item);
    });
  }
  
  hideFieldList() {
    this.elements.fieldList.classList.add('hidden');
  }
  
  showError(message) {
    this.elements.errorMessage.textContent = message;
    this.elements.errorMessage.classList.remove('hidden');
    this.elements.successMessage.classList.add('hidden');
  }
  
  showSuccess(message) {
    this.elements.successMessage.textContent = message;
    this.elements.successMessage.classList.remove('hidden');
    this.elements.errorMessage.classList.add('hidden');
  }
  
  hideMessages() {
    this.elements.errorMessage.classList.add('hidden');
    this.elements.successMessage.classList.add('hidden');
  }
  
  toggleButtons(processing) {
    if (processing) {
      this.elements.processBtn.classList.add('hidden');
      this.elements.stopBtn.classList.remove('hidden');
    } else {
      this.elements.processBtn.classList.remove('hidden');
      this.elements.stopBtn.classList.add('hidden');
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});