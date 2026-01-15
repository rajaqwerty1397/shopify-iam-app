/**
 * SSO Login Button Injection
 * Injects SSO/Social login buttons into Shopify login forms
 * Compatible with all Shopify themes (Dawn, Debut, vintage, custom)
 */
(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.SSOLoginAppInit) return;
  window.SSOLoginAppInit = true;

  // Multiple selectors for cross-theme compatibility
  var SELECTORS = {
    loginForm: [
      'form[action*="/account/login"]',
      'form[action*="customer/login"]',
      '#customer_login',
      '.customer-login form',
      '[data-login-form]',
      'form.login-form'
    ],
    submitButton: [
      'button[type="submit"]',
      'input[type="submit"]',
      '.btn--primary[type="submit"]',
      '[data-login-submit]',
      '.form__submit button',
      '.customer-login button'
    ],
    forgotPassword: [
      'a[href*="recover"]',
      '.forgot-password',
      '[data-recover-link]'
    ]
  };

  // Get config from data element
  function getConfig() {
    var dataEl = document.getElementById('sso-login-app-data');
    if (!dataEl) return null;
    
    return {
      enabled: dataEl.dataset.enabled === 'true',
      idpUrl: dataEl.dataset.idpUrl || '',
      shop: dataEl.dataset.shop || '',
      enableSso: dataEl.dataset.enableSso === 'true',
      ssoText: dataEl.dataset.ssoText || 'Sign in with SSO',
      enableGoogle: dataEl.dataset.enableGoogle === 'true',
      enableMicrosoft: dataEl.dataset.enableMicrosoft === 'true',
      buttonColor: dataEl.dataset.buttonColor || '#000000',
      buttonTextColor: dataEl.dataset.buttonTextColor || '#ffffff'
    };
  }

  // Find element using multiple selectors
  function findElement(selectorArray) {
    for (var i = 0; i < selectorArray.length; i++) {
      var el = document.querySelector(selectorArray[i]);
      if (el) return el;
    }
    return null;
  }

  // Create SSO buttons HTML
  function createButtonsHTML(config) {
    var html = '<div class="sso-login-divider"><span>or continue with</span></div>';
    html += '<div class="sso-login-buttons">';
    
    if (config.enableSso) {
      html += '<button type="button" class="sso-login-btn sso-login-btn--primary" data-sso-provider="enterprise" style="background-color:' + config.buttonColor + ';color:' + config.buttonTextColor + ';border-color:' + config.buttonColor + ';">';
      html += '<svg class="sso-login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
      html += '<span>' + config.ssoText + '</span>';
      html += '</button>';
    }
    
    if (config.enableGoogle) {
      html += '<button type="button" class="sso-login-btn sso-login-btn--google" data-sso-provider="google">';
      html += '<svg class="sso-login-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
      html += '<span>Continue with Google</span>';
      html += '</button>';
    }
    
    if (config.enableMicrosoft) {
      html += '<button type="button" class="sso-login-btn sso-login-btn--microsoft" data-sso-provider="microsoft">';
      html += '<svg class="sso-login-icon" viewBox="0 0 23 23"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="12" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="12" width="10" height="10" fill="#00A4EF"/><rect x="12" y="12" width="10" height="10" fill="#FFB900"/></svg>';
      html += '<span>Continue with Microsoft</span>';
      html += '</button>';
    }
    
    html += '</div>';
    return html;
  }

  // Handle SSO button click
  function handleSSOClick(e, config) {
    var btn = e.target.closest('.sso-login-btn');
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    var provider = btn.dataset.ssoProvider;
    
    if (!config.idpUrl) {
      alert('SSO is not configured.\n\nPlease ask the store administrator to set the IDP URL in:\nOnline Store → Themes → Customize → App embeds → SSO Login');
      return;
    }
    
    var returnUrl = window.location.origin + '/account';
    var authUrl = config.idpUrl;
    
    if (provider === 'enterprise') {
      authUrl += '/auth/login';
    } else {
      authUrl += '/auth/' + provider;
    }
    
    authUrl += '?shop=' + encodeURIComponent(config.shop);
    authUrl += '&return_to=' + encodeURIComponent(returnUrl);
    
    console.log('[SSO] Redirecting to:', authUrl);
    window.location.href = authUrl;
  }

  // Inject SSO buttons into form
  function injectSSOButtons(form, config) {
    // Check if already injected
    if (document.getElementById('sso-login-container')) {
      console.log('[SSO] Already injected, skipping');
      return;
    }
    
    // Mark form as processed
    form.dataset.ssoInjected = 'true';
    
    // Create container
    var container = document.createElement('div');
    container.id = 'sso-login-container';
    container.className = 'sso-login-container';
    container.innerHTML = createButtonsHTML(config);
    
    // Strategy: Find the form's visual container and insert after the form
    // This ensures visibility regardless of form's internal CSS structure
    
    var inserted = false;
    
    // Try 1: Insert after the form element itself
    if (form.parentElement) {
      form.parentElement.insertBefore(container, form.nextSibling);
      inserted = true;
      console.log('[SSO] Inserted after form');
    }
    
    // Try 2: If form has no next sibling, append to parent
    if (!inserted && form.parentElement) {
      form.parentElement.appendChild(container);
      inserted = true;
      console.log('[SSO] Appended to form parent');
    }
    
    // Fallback: append to body
    if (!inserted) {
      document.body.appendChild(container);
      console.log('[SSO] Fallback: appended to body');
    }
    
    // Apply inline styles to ensure visibility
    container.style.cssText = 'display:block !important; visibility:visible !important; opacity:1 !important; margin:24px auto; max-width:400px; padding:0 15px; box-sizing:border-box;';
    
    // Attach click handler
    container.addEventListener('click', function(e) {
      handleSSOClick(e, config);
    });
    
    console.log('[SSO] Buttons injected successfully at:', container.parentElement.tagName);
  }

  // Main initialization
  function init() {
    var config = getConfig();
    
    if (!config) {
      console.log('[SSO] No config data found');
      return;
    }
    
    if (!config.enabled) {
      console.log('[SSO] Disabled in settings');
      return;
    }
    
    if (!config.enableSso && !config.enableGoogle && !config.enableMicrosoft) {
      console.log('[SSO] No providers enabled');
      return;
    }
    
    console.log('[SSO] Initializing with config:', config);
    
    // Try to find and inject immediately
    var form = findElement(SELECTORS.loginForm);
    if (form) {
      injectSSOButtons(form, config);
      return;
    }
    
    // Use MutationObserver for dynamically loaded forms
    console.log('[SSO] Form not found, watching for DOM changes...');
    
    var observer = new MutationObserver(function(mutations, obs) {
      var form = findElement(SELECTORS.loginForm);
      if (form && form.dataset.ssoInjected !== 'true') {
        obs.disconnect();
        injectSSOButtons(form, config);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Timeout fallback
    setTimeout(function() {
      observer.disconnect();
      var form = findElement(SELECTORS.loginForm);
      if (form && form.dataset.ssoInjected !== 'true') {
        injectSSOButtons(form, config);
      } else if (!form) {
        console.warn('[SSO] Login form not found after timeout');
      }
    }, 5000);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
