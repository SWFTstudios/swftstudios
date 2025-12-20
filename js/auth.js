/**
 * SWFT Notes Authentication
 * 
 * Handles Supabase authentication (email/password sign-in and sign-up)
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
    authorizedUsers: [] // No longer needed - all authenticated users can upload
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
    passwordInput: document.getElementById('password-input'),
    emailSubmitBtn: document.getElementById('email-submit-btn'),
    submitButtonText: document.getElementById('submit-button-text'),
    signinToggle: document.getElementById('signin-toggle'),
    signupToggle: document.getElementById('signup-toggle'),
    authError: document.getElementById('auth-error'),
    errorMessage: document.getElementById('error-message'),
    authLoading: document.getElementById('auth-loading'),
    emailAuth: document.getElementById('email-auth')
  };
  
  let authMode = 'signin'; // 'signin' or 'signup'

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
   * Only used from auth.html - blog.html is public, upload.html is protected
   */
  let isRedirecting = false; // Prevent multiple redirects
  let redirectTimeout = null; // Track redirect timeout
  
  async function redirectUser(user) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:83',message:'redirectUser called',data:{userEmail:user?.email,isRedirecting,currentPath:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    // Prevent redirect loops
    if (isRedirecting) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:86',message:'redirectUser blocked - already redirecting',data:{isRedirecting},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.log('Redirect already in progress, skipping');
      return;
    }

    if (!user || !user.email) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:92',message:'redirectUser - no user email',data:{user:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.warn('No user email found');
      hideLoading(); // Hide loading if no user
      isRedirecting = true;
      setTimeout(() => {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:95',message:'redirectUser - redirecting to blog (no user)',data:{url:CONFIG.redirectUrls.blog},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        window.location.href = CONFIG.redirectUrls.blog;
      }, 100);
      return;
    }

    // All authenticated users can access upload page
    isRedirecting = true;
    
    // Set a timeout to hide loading if redirect takes too long
    redirectTimeout = setTimeout(() => {
      console.warn('Redirect taking too long, hiding loading spinner');
      hideLoading();
      isRedirecting = false;
      showError('Redirect is taking longer than expected. Please try refreshing the page.');
    }, 5000);
    
    try {
      // Redirect authenticated users to upload page
      console.log('User authenticated, redirecting to upload page');
      window.location.href = CONFIG.redirectUrls.upload;
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:122',message:'redirectUser - location.href set',data:{redirectUrl:authorized ? CONFIG.redirectUrls.upload : CONFIG.redirectUrls.blog},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:125',message:'redirectUser - error caught',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.error('Redirect error:', error);
      clearTimeout(redirectTimeout);
      hideLoading();
      isRedirecting = false;
      showError('Failed to redirect. Please try refreshing the page.');
    }
  }

  // ==========================================================================
  // Email Authentication
  // ==========================================================================
  
  /**
   * Handle email/password sign-in or sign-up
   */
  async function handleEmailAuth(email, password) {
    if (!supabase) {
      showError('Authentication service unavailable');
      return;
    }

    try {
      setLoading(elements.emailSubmitBtn, true);
      hideError();

      let result;
      
      if (authMode === 'signup') {
        // Sign up
        result = await supabase.auth.signUp({
          email: email,
          password: password
        });
      } else {
        // Sign in
        result = await supabase.auth.signInWithPassword({
          email: email,
          password: password
        });
      }

      if (result.error) throw result.error;

      // Success - redirect will happen via auth state change listener
      if (authMode === 'signup' && result.data.user) {
        // Show success message briefly before redirect
        hideError();
        if (elements.emailAuth) {
          elements.emailAuth.innerHTML = `
            <div class="auth-message success">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <p>Account created! Redirecting...</p>
            </div>
          `;
        }
      }

    } catch (error) {
      console.error('Auth error:', error);
      showError(error.message || `Failed to ${authMode === 'signup' ? 'create account' : 'sign in'}. Please try again.`);
    } finally {
      setLoading(elements.emailSubmitBtn, false);
    }
  }
  
  /**
   * Toggle between sign in and sign up modes
   */
  function setAuthMode(mode) {
    authMode = mode;
    
    // Update toggle buttons
    if (elements.signinToggle && elements.signupToggle) {
      elements.signinToggle.classList.toggle('active', mode === 'signin');
      elements.signupToggle.classList.toggle('active', mode === 'signup');
    }
    
    // Update submit button text
    if (elements.submitButtonText) {
      elements.submitButtonText.textContent = mode === 'signup' ? 'Sign Up' : 'Sign In';
    }
    
    // Update password field placeholder
    if (elements.passwordInput) {
      elements.passwordInput.placeholder = mode === 'signup' ? 'At least 6 characters' : '••••••••';
      elements.passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
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
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:226',message:'checkSession called',data:{currentPath:window.location.pathname,hasSupabase:!!supabase},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (!supabase) return;

    const currentPath = window.location.pathname;
    
    // Blog page is public - no auth checks needed
    if (currentPath.includes('blog.html') || currentPath.includes('/blog')) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:234',message:'checkSession - on blog page (public), skipping',data:{currentPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return; // Blog is public, no auth needed
    }

    // Don't check session on auth.html - let that page handle its own auth
    if (currentPath.includes('auth.html') || currentPath.includes('/auth')) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:240',message:'checkSession - on auth page, hiding loading',data:{currentPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      hideLoading();
      return;
    }

    // Upload page requires auth - handled by upload.js, but we can skip here
    if (currentPath.includes('upload.html') || currentPath.includes('/upload')) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:247',message:'checkSession - on upload page, let upload.js handle auth',data:{currentPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return; // Let upload.js handle its own auth
    }

    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:248',message:'checkSession - calling getSession',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:251',message:'checkSession - getSession error',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        throw error;
      }

      if (session && session.user) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:254',message:'checkSession - session found',data:{userEmail:session.user.email,isRedirecting},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        console.log('Session found:', session.user.email);
        // Small delay to prevent race condition with auth state change
        setTimeout(() => {
          if (!isRedirecting) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:257',message:'checkSession - calling redirectUser',data:{userEmail:session.user.email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            redirectUser(session.user);
          }
        }, 100);
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:262',message:'checkSession - no session',data:{hasSession:!!session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:265',message:'checkSession - error caught',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      console.error('Session check error:', error);
    }
  }

  /**
   * Handle auth state changes (for OAuth callbacks)
   */
  function setupAuthListener() {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:268',message:'setupAuthListener called',data:{hasSupabase:!!supabase,currentPath:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    if (!supabase) return;

    // Don't set up auth listener on upload.html - it has its own auth handling
    const currentPath = window.location.pathname;
    if (currentPath.includes('upload.html') || currentPath.includes('/upload')) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:273',message:'setupAuthListener - skipping on upload page',data:{currentPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return; // Let upload.js handle its own auth
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:276',message:'setupAuthListener - registering onAuthStateChange',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    supabase.auth.onAuthStateChange(async (event, session) => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:277',message:'onAuthStateChange fired',data:{event,userEmail:session?.user?.email,hasSession:!!session,currentPath:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.log('Auth state changed:', event, session?.user?.email);

      // Only handle SIGNED_IN if we're on auth.html (callback page)
      // Don't redirect from blog.html - it's public
      if (event === 'SIGNED_IN' && session && session.user) {
        const currentPath = window.location.pathname;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:282',message:'SIGNED_IN event detected',data:{userEmail:session.user.email,currentPath,isAuthPage:currentPath.includes('auth.html')||currentPath.includes('/auth')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Only redirect if we're on auth.html (not already on target page)
        if (currentPath.includes('auth.html') || currentPath.includes('/auth')) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:287',message:'SIGNED_IN - calling showLoading',data:{userEmail:session.user.email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.log('User signed in:', session.user.email);
          showLoading();
          
          // Small delay to ensure session is fully established
          setTimeout(() => {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:291',message:'SIGNED_IN - calling redirectUser after timeout',data:{userEmail:session.user.email,isRedirecting},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            redirectUser(session.user);
          }, 200);
        }
      }

      if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        hideLoading(); // Hide loading on sign out
        clearTimeout(redirectTimeout); // Clear any pending redirect timeout
        isRedirecting = false; // Reset redirect flag
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

      // Handle errors
      if (event === 'SIGNED_IN' && !session) {
        console.warn('SIGNED_IN event but no session');
        hideLoading();
        clearTimeout(redirectTimeout);
        isRedirecting = false;
        showError('Authentication failed. Please try again.');
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
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:360',message:'showLoading called',data:{stack:new Error().stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!elements.authLoading) return;
    const wasHidden = elements.authLoading.hidden;
    elements.authLoading.hidden = false;
    if (elements.emailAuth) elements.emailAuth.hidden = true;
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:365',message:'showLoading executed',data:{wasHidden,nowHidden:false,elementExists:!!elements.authLoading},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
  }

  /**
   * Hide loading overlay
   */
  function hideLoading() {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:369',message:'hideLoading called',data:{stack:new Error().stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!elements.authLoading) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:372',message:'hideLoading early return - no element',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return;
    }
    const wasHidden = elements.authLoading.hidden;
    elements.authLoading.hidden = true;
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:376',message:'hideLoading executed',data:{wasHidden,nowHidden:true,elementExists:!!elements.authLoading},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
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
        const password = elements.passwordInput.value;
        
        if (!email) {
          showError('Please enter your email address');
          return;
        }
        if (!password || password.length < 6) {
          showError('Please enter a password (at least 6 characters)');
          return;
        }
        
        await handleEmailAuth(email, password);
      });
    }

    // Toggle between sign in and sign up
    if (elements.signinToggle) {
      elements.signinToggle.addEventListener('click', () => setAuthMode('signin'));
    }
    if (elements.signupToggle) {
      elements.signupToggle.addEventListener('click', () => setAuthMode('signup'));
    }
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  async function init() {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:406',message:'init called',data:{readyState:document.readyState,currentPath:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    // Check if Supabase client is initialized
    if (!supabase) {
      showError('Authentication service unavailable');
      return;
    }

    // Make sure loading is hidden on initial load
    hideLoading();

    // Setup event listeners
    setupEventListeners();

    // Setup auth state listener
    setupAuthListener();

    // Check for existing session
    await checkSession();
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:424',message:'init completed',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
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
