/**
 * SWFT Notes Authentication
 * 
 * Handles Supabase authentication (email magic link + GitHub OAuth)
 * Checks authorization and redirects users appropriately
 */

(function() {
  'use strict';

  // ==========================================================================
  // Configuration
  // ==========================================================================
  
  const CONFIG = {
    supabaseUrl: 'https://mnrteunavnzrglbozpfc.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucnRldW5hdm56cmdsYm96cGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTM5NjUsImV4cCI6MjA4MTY2OTk2NX0.7XORw2dbCDG64i2HfiAaTt70ZJTg89BVO7DAPeSCsU8',
    redirectUrls: {
      upload: '/upload.html',
      blog: '/blog.html'
    },
    authorizedUsers: [
      'elombe@swftstudios.com',
      'elombekisala@gmail.com',
      'stephen@swftstudios.com',
      'stephen.iezzi@gmail.com'
    ]
  };

  // ==========================================================================
  // Supabase Client
  // ==========================================================================
  
  let supabase;
  
  try {
    supabase = window.supabase.createClient(
      CONFIG.supabaseUrl,
      CONFIG.supabaseAnonKey
    );
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    showError('Authentication service unavailable. Please try again later.');
  }

  // ==========================================================================
  // DOM Elements
  // ==========================================================================
  
  const elements = {
    emailForm: document.getElementById('email-form'),
    emailInput: document.getElementById('email-input'),
    emailSubmitBtn: document.getElementById('email-submit-btn'),
    emailSuccess: document.getElementById('email-success'),
    githubBtn: document.getElementById('github-auth-btn'),
    authError: document.getElementById('auth-error'),
    errorMessage: document.getElementById('error-message'),
    authLoading: document.getElementById('auth-loading'),
    emailAuth: document.getElementById('email-auth')
  };

  // ==========================================================================
  // Authorization Check
  // ==========================================================================
  
  /**
   * Check if user email is in authorized list
   */
  function isAuthorizedUser(email) {
    if (!email) return false;
    const normalizedEmail = email.toLowerCase().trim();
    return CONFIG.authorizedUsers.some(
      authEmail => authEmail.toLowerCase() === normalizedEmail
    );
  }

  /**
   * Redirect user based on authorization status
   */
  async function redirectUser(user) {
    if (!user || !user.email) {
      console.warn('No user email found');
      window.location.href = CONFIG.redirectUrls.blog;
      return;
    }

    const authorized = isAuthorizedUser(user.email);

    if (authorized) {
      console.log('User authorized, redirecting to upload page');
      window.location.href = CONFIG.redirectUrls.upload;
    } else {
      console.log('User not authorized, redirecting to blog (read-only)');
      // You could show a message before redirecting
      window.location.href = CONFIG.redirectUrls.blog;
    }
  }

  // ==========================================================================
  // Email Authentication
  // ==========================================================================
  
  /**
   * Handle email magic link sign-in
   */
  async function signInWithEmail(email) {
    if (!supabase) {
      showError('Authentication service unavailable');
      return;
    }

    try {
      setLoading(elements.emailSubmitBtn, true);
      hideError();

      const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth.html`
        }
      });

      if (error) throw error;

      // Show success message
      elements.emailAuth.hidden = true;
      elements.emailSuccess.hidden = false;

    } catch (error) {
      console.error('Email sign-in error:', error);
      showError(error.message || 'Failed to send magic link. Please try again.');
    } finally {
      setLoading(elements.emailSubmitBtn, false);
    }
  }

  // ==========================================================================
  // GitHub OAuth
  // ==========================================================================
  
  /**
   * Handle GitHub OAuth sign-in
   */
  async function signInWithGitHub() {
    if (!supabase) {
      showError('Authentication service unavailable');
      return;
    }

    try {
      setLoading(elements.githubBtn, true);
      hideError();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth.html`
        }
      });

      if (error) throw error;

      // OAuth will redirect, so show loading state
      showLoading();

    } catch (error) {
      console.error('GitHub sign-in error:', error);
      showError(error.message || 'Failed to sign in with GitHub. Please try again.');
      setLoading(elements.githubBtn, false);
    }
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================
  
  /**
   * Check for existing session and handle redirect
   */
  async function checkSession() {
    if (!supabase) return;

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (session && session.user) {
        console.log('Session found:', session.user.email);
        await redirectUser(session.user);
      }
    } catch (error) {
      console.error('Session check error:', error);
    }
  }

  /**
   * Handle auth state changes (for OAuth callbacks)
   */
  function setupAuthListener() {
    if (!supabase) return;

    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);

      if (event === 'SIGNED_IN' && session && session.user) {
        console.log('User signed in:', session.user.email);
        showLoading();
        await redirectUser(session.user);
      }

      if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        window.location.href = CONFIG.redirectUrls.blog;
      }

      if (event === 'USER_UPDATED' && session && session.user) {
        console.log('User updated:', session.user.email);
      }
    });
  }

  // ==========================================================================
  // UI Helpers
  // ==========================================================================
  
  /**
   * Set button loading state
   */
  function setLoading(button, loading) {
    if (!button) return;
    button.disabled = loading;
    button.classList.toggle('loading', loading);
  }

  /**
   * Show error message
   */
  function showError(message) {
    if (!elements.authError || !elements.errorMessage) return;
    elements.errorMessage.textContent = message;
    elements.authError.hidden = false;
  }

  /**
   * Hide error message
   */
  function hideError() {
    if (!elements.authError) return;
    elements.authError.hidden = true;
  }

  /**
   * Show loading overlay
   */
  function showLoading() {
    if (!elements.authLoading) return;
    elements.authLoading.hidden = false;
    if (elements.emailAuth) elements.emailAuth.hidden = true;
  }

  /**
   * Hide loading overlay
   */
  function hideLoading() {
    if (!elements.authLoading) return;
    elements.authLoading.hidden = true;
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  
  function setupEventListeners() {
    // Email form submission
    if (elements.emailForm) {
      elements.emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = elements.emailInput.value.trim();
        
        if (!email) {
          showError('Please enter a valid email address');
          return;
        }

        await signInWithEmail(email);
      });
    }

    // GitHub OAuth button
    if (elements.githubBtn) {
      elements.githubBtn.addEventListener('click', async () => {
        await signInWithGitHub();
      });
    }
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  async function init() {
    // Check if Supabase client is initialized
    if (!supabase) {
      showError('Authentication service unavailable');
      return;
    }

    // Setup event listeners
    setupEventListeners();

    // Setup auth state listener
    setupAuthListener();

    // Check for existing session
    await checkSession();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for use in other scripts
  window.SWFTAuth = {
    supabase,
    isAuthorizedUser,
    checkSession
  };

})();
