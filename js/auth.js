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
  let isRedirecting = false; // Prevent multiple redirects
  
  async function redirectUser(user) {
    // Prevent redirect loops
    if (isRedirecting) {
      console.log('Redirect already in progress, skipping');
      return;
    }

    if (!user || !user.email) {
      console.warn('No user email found');
      isRedirecting = true;
      window.location.href = CONFIG.redirectUrls.blog;
      return;
    }

    const authorized = isAuthorizedUser(user.email);

    isRedirecting = true;
    
    if (authorized) {
      console.log('User authorized, redirecting to upload page');
      window.location.href = CONFIG.redirectUrls.upload;
    } else {
      console.log('User not authorized, redirecting to blog (read-only)');
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
          redirectTo: `${window.location.origin}/auth.html`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        console.error('GitHub OAuth error:', error);
        throw error;
      }

      // OAuth will redirect, so show loading state
      showLoading();

    } catch (error) {
      console.error('GitHub sign-in error:', error);
      let errorMessage = 'Failed to sign in with GitHub. ';
      
      if (error.message && error.message.includes('404')) {
        errorMessage += 'GitHub OAuth app not configured. Please contact admin.';
      } else {
        errorMessage += error.message || 'Please try again.';
      }
      
      showError(errorMessage);
      setLoading(elements.githubBtn, false);
    }
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================
  
  /**
   * Check for existing session and handle redirect
   * Only redirect if we're on auth.html (not already on target page)
   */
  async function checkSession() {
    if (!supabase) return;

    // Don't redirect if already on upload or blog page
    const currentPath = window.location.pathname;
    if (currentPath.includes('upload.html') || currentPath.includes('blog.html')) {
      return;
    }

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (session && session.user) {
        console.log('Session found:', session.user.email);
        // Small delay to prevent race condition with auth state change
        setTimeout(() => {
          if (!isRedirecting) {
            redirectUser(session.user);
          }
        }, 100);
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
      console.log('Auth state changed:', event, session?.user?.email);

      // Only handle SIGNED_IN if we're on auth.html (callback page)
      if (event === 'SIGNED_IN' && session && session.user) {
        const currentPath = window.location.pathname;
        
        // Only redirect if we're on auth.html (not already on target page)
        if (currentPath.includes('auth.html')) {
          console.log('User signed in:', session.user.email);
          showLoading();
          
          // Small delay to ensure session is fully established
          setTimeout(() => {
            redirectUser(session.user);
          }, 200);
        }
      }

      if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        // Only redirect if not already on blog
        if (!window.location.pathname.includes('blog.html')) {
          window.location.href = CONFIG.redirectUrls.blog;
        }
      }

      if (event === 'USER_UPDATED' && session && session.user) {
        console.log('User updated:', session.user.email);
      }

      // Handle TOKEN_REFRESHED to prevent loops
      if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed');
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
