// Injected script that runs in page context
// This script can interact with the page's JavaScript context

(function() {
  'use strict';
  
  // Helper function to detect React components
  window.detectReactComponent = function(element) {
    // Check for React fiber node
    if (element._reactInternalFiber || element._reactInternalInstance) {
      return true;
    }
    
    // Check for React event listeners
    if (element.hasOwnProperty('__reactEventHandlers$')) {
      return true;
    }
    
    // Check for React props
    for (let key in element) {
      if (key.startsWith('__reactInternal') || key.startsWith('__reactEventHandlers')) {
        return true;
      }
    }
    
    return false;
  };
  
  // Helper function to detect Angular components
  window.detectAngularComponent = function(element) {
    // Check for Angular component classes
    if (element.className && element.className.includes('ng-')) {
      return true;
    }
    
    // Check for Angular attributes
    if (element.hasAttribute('ng-model') || element.hasAttribute('ng-bind')) {
      return true;
    }
    
    // Check for Angular debug info (older versions)
    if (window.angular && window.angular.element) {
      const ngElement = window.angular.element(element);
      if (ngElement.data('$ngControllerController') || ngElement.scope()) {
        return true;
      }
    }
    
    return false;
  };
  
  // Enhanced form filling for React/Angular
  window.enhancedFormFill = function(element, value) {
    const isReact = detectReactComponent(element);
    const isAngular = detectAngularComponent(element);
    
    console.log('Enhanced form fill:', {
      element: element.tagName,
      value: value,
      isReact: isReact,
      isAngular: isAngular
    });
    
    // Store original value
    const originalValue = element.value;
    
    // Set the value
    element.value = value;
    element.setAttribute('value', value);
    
    if (isReact) {
      // React-specific handling
      // Trigger React's synthetic event system
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(element, value);
      
      // Create and dispatch React-compatible events
      const inputEvent = new Event('input', { bubbles: true });
      inputEvent.simulated = true;
      element.dispatchEvent(inputEvent);
      
      const changeEvent = new Event('change', { bubbles: true });
      changeEvent.simulated = true;
      element.dispatchEvent(changeEvent);
      
      // Trigger React's onChange if it exists
      if (element.onchange) {
        element.onchange(changeEvent);
      }
      
    } else if (isAngular) {
      // Angular-specific handling
      // Trigger Angular's change detection
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      
      // Trigger Angular model update
      if (window.angular && window.angular.element) {
        const scope = window.angular.element(element).scope();
        if (scope) {
          scope.$apply(() => {
            // Angular will pick up the change
          });
        }
      }
      
    } else {
      // Standard form handling
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // Always trigger blur for validation
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    
    // Verify the value was set correctly
    if (element.value !== value) {
      console.warn('Value verification failed, attempting alternative method');
      element.value = value;
      element.setAttribute('value', value);
    }
    
    return element.value === value;
  };
  
  // Monitor for dynamically added form fields
  let observer = null;
  
  window.startFormMonitoring = function() {
    if (observer) {
      observer.disconnect();
    }
    
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if added node contains form elements
            const inputs = node.querySelectorAll && node.querySelectorAll('input, textarea');
            if (inputs && inputs.length > 0) {
              console.log('New form elements detected:', inputs.length);
              
              // Notify content script about new elements
              window.postMessage({
                type: 'VOICE_FORM_FILLER_NEW_ELEMENTS',
                count: inputs.length
              }, '*');
            }
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };
  
  window.stopFormMonitoring = function() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };
  
  // Auto-start monitoring
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startFormMonitoring);
  } else {
    startFormMonitoring();
  }
  
  // Listen for messages from content script
  window.addEventListener('message', (event) => {
    if (event.data.type === 'VOICE_FORM_FILLER_ENHANCED_FILL') {
      const { elementSelector, value } = event.data;
      const element = document.querySelector(elementSelector);
      
      if (element) {
        const success = window.enhancedFormFill(element, value);
        
        // Send result back
        window.postMessage({
          type: 'VOICE_FORM_FILLER_ENHANCED_FILL_RESULT',
          success: success,
          elementSelector: elementSelector
        }, '*');
      }
    }
  });
  
  console.log('Voice Form Filler injected script loaded');
})();