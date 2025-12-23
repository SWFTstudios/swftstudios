/**
 * SWFT Studios Thought Sessions Authentication
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
    emailAuth: document.getElementById('email-auth'),
    githubConnection: document.getElementById('github-connection'),
    githubRepoUrl: document.getElementById('github-repo-url'),
    githubDisconnectBtn: document.getElementById('github-disconnect-btn'),
    githubLinkSection: document.getElementById('github-link-section'),
    linkGithubBtn: document.getElementById('link-github-btn')
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
    // Prevent redirect loops
    if (isRedirecting) {
      console.log('Redirect already in progress, skipping');
      return;
    }

    if (!user || !user.email) {
      console.warn('No user email found');
      hideLoading(); // Hide loading if no user
      isRedirecting = true;
      setTimeout(() => {
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
    } catch (error) {
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
      // Hide any previous errors and ensure loading overlay is hidden
      hideError();
      hideLoading();
      // Show button loading spinner only (not full-page loading)
      setLoading(elements.emailSubmitBtn, true);

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
      // Ensure loading overlay is hidden on error
      hideLoading();
      // Show error message
      showError(error.message || `Failed to ${authMode === 'signup' ? 'create account' : 'sign in'}. Please try again.`);
    } finally {
      // Always hide button spinner when done
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
  // Session Management
  // ==========================================================================
  
  /**
   * Check for existing session and handle redirect
   * Only redirect if we're on auth.html (not already on target page)
   */
  async function checkSession() {
    if (!supabase) return;

    const currentPath = window.location.pathname;
    
    // Blog page is public - no auth checks needed
    if (currentPath.includes('blog.html') || currentPath.includes('/blog')) {
      return; // Blog is public, no auth needed
    }

    // Don't check session on auth.html - let that page handle its own auth
    if (currentPath.includes('auth.html') || currentPath.includes('/auth')) {
      hideLoading();
      return;
    }

    // Upload page requires auth - handled by upload.js, but we can skip here
    if (currentPath.includes('upload.html') || currentPath.includes('/upload')) {
      return; // Let upload.js handle its own auth
    }

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      if (session && session.user) {
        console.log('Session found:', session.user.email);
        // Small delay to prevent race condition with auth state change
        setTimeout(() => {
          if (!isRedirecting) {
            redirectUser(session.user);
          }
        }, 100);
      } else {
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

    // Don't set up auth listener on upload.html - it has its own auth handling
    const currentPath = window.location.pathname;
    if (currentPath.includes('upload.html') || currentPath.includes('/upload')) {
      return; // Let upload.js handle its own auth
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      // Only handle SIGNED_IN if we're on auth.html (callback page)
      // Don't redirect from blog.html - it's public
      if (event === 'SIGNED_IN' && session && session.user) {
        const currentPath = window.location.pathname;
        
        // Only redirect if we're on auth.html (not already on target page)
        if (currentPath.includes('auth.html') || currentPath.includes('/auth')) {
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
    if (!elements.authLoading) return;
    // Hide error message when showing loading
    hideError();
    // Hide form and show loading
    if (elements.emailAuth) elements.emailAuth.hidden = true;
    elements.authLoading.hidden = false;
  }

  /**
   * Hide loading overlay
   */
  function hideLoading() {
    if (!elements.authLoading) return;
    // Hide loading and restore form
    elements.authLoading.hidden = true;
    if (elements.emailAuth) elements.emailAuth.hidden = false;
  }

  // ==========================================================================
  // GitHub Integration
  // ==========================================================================

  /**
   * Check if user has GitHub account linked
   */
  async function checkGitHubConnection() {
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) {
        return;
      }

      const { data, error } = await supabase
        .from('user_github_accounts')
        .select('github_username, repo_name, repo_url')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking GitHub connection:', error);
        return;
      }

      if (data) {
        showGitHubConnected(data);
      } else {
        showGitHubLinkSection();
      }
    } catch (error) {
      console.error('Error checking GitHub connection:', error);
    }
  }

  /**
   * Show GitHub connected status
   */
  function showGitHubConnected(data) {
    if (!elements.githubConnection || !elements.githubRepoUrl) return;
    
    elements.githubConnection.hidden = false;
    if (elements.githubLinkSection) {
      elements.githubLinkSection.hidden = true;
    }
    
    if (data.repo_url) {
      elements.githubRepoUrl.textContent = data.repo_url;
      elements.githubRepoUrl.href = data.repo_url;
      elements.githubRepoUrl.target = '_blank';
    } else {
      elements.githubRepoUrl.textContent = `@${data.github_username}`;
    }
  }

  /**
   * Show GitHub link section
   */
  function showGitHubLinkSection() {
    if (!elements.githubLinkSection) return;
    
    elements.githubLinkSection.hidden = false;
    if (elements.githubConnection) {
      elements.githubConnection.hidden = true;
    }
  }

  /**
   * Link GitHub account via OAuth
   */
  async function linkGitHubAccount() {
    if (!supabase) {
      showError('Authentication service unavailable');
      return;
    }

    try {
      const redirectUrl = `${window.location.origin}/auth.html?github_link=true`;
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectUrl,
          scopes: 'repo user:email',
          queryParams: {
            redirect_to: redirectUrl
          }
        }
      });

      if (error) throw error;
      
      // If data.url exists, Supabase will redirect automatically
      // Otherwise, handle manually
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      showError('Failed to connect GitHub account. Please try again.');
    }
  }

  /**
   * Handle GitHub OAuth callback and create repo
   */
  async function handleGitHubCallback() {
    if (!supabase) return;

    const urlParams = new URLSearchParams(window.location.search);
    const urlHash = new URLSearchParams(window.location.hash.substring(1));
    
    // Check for GitHub link flag in query params or hash
    const isGitHubLink = urlParams.get('github_link') === 'true' || urlHash.get('github_link') === 'true';
    
    // Also check for OAuth code/tokens in hash (Supabase redirects to hash)
    const hasOAuthCode = urlHash.has('access_token') || urlHash.has('code') || urlParams.has('code');

    // If we have OAuth tokens but no github_link flag, check if session has GitHub provider
    if (!isGitHubLink && hasOAuthCode) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.provider_token && session.user.user_metadata?.provider === 'github') {
          // This is a GitHub OAuth callback, process it
          console.log('Detected GitHub OAuth callback via hash');
        } else {
          return; // Not a GitHub OAuth callback
        }
      } catch (e) {
        return; // Can't verify, skip
      }
    }

    if (!isGitHubLink && !hasOAuthCode) return;

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) throw sessionError;
      if (!session || !session.user) return;

      // Get GitHub provider token from session
      const providerToken = session.provider_token;
      const providerRefreshToken = session.provider_refresh_token;

      if (!providerToken) {
        console.error('No GitHub token found in session');
        return;
      }

      // Get GitHub username from user metadata
      const githubUsername = session.user.user_metadata?.user_name || 
                            session.user.user_metadata?.preferred_username ||
                            session.user.user_metadata?.full_name;

      if (!githubUsername) {
        console.error('No GitHub username found');
        return;
      }

      // Get GitHub email from session (for matching)
      const githubEmail = session.user.email || session.user.user_metadata?.email;

      // Check if GitHub account exists by email (for matching)
      let existingAccount = null;
      if (githubEmail) {
        const { data: existingData } = await supabase
          .from('user_github_accounts')
          .select('*')
          .eq('github_email', githubEmail)
          .eq('is_active', true)
          .single();
        
        if (existingData) {
          existingAccount = existingData;
        }
      }

      // Store GitHub account info (update existing or create new)
      const accountData = {
        user_id: session.user.id,
        github_username: githubUsername,
        github_access_token: providerToken, // In production, encrypt this
        is_active: true
      };

      if (githubEmail) {
        accountData.github_email = githubEmail;
      }

      const { error: insertError } = await supabase
        .from('user_github_accounts')
        .upsert(accountData, {
          onConflict: 'user_id'
        });

      if (insertError) {
        console.error('Error storing GitHub account:', insertError);
        showError('Failed to save GitHub connection. Please try again.');
        return;
      }

      // Create GitHub repo via Cloudflare Function
      try {
        const response = await fetch('/api/github/create-repo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            github_token: providerToken,
            github_username: githubUsername
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create repository');
        }

        const repoData = await response.json();
        
        // Update database with repo info
        await supabase
          .from('user_github_accounts')
          .update({
            repo_name: repoData.repo_name,
            repo_url: repoData.repo_url
          })
          .eq('user_id', session.user.id);

        // Show success and refresh connection status
        await checkGitHubConnection();
        
        // Clean up URL - remove hash and query params
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        
        // Redirect to upload page if linking from auth page
        if (window.location.pathname === '/auth.html') {
          setTimeout(() => {
            window.location.href = '/upload.html';
          }, 1000);
        }
      } catch (repoError) {
        console.error('Error creating repo:', repoError);
        const errorMessage = repoError.message || 'Failed to create repository';
        
        // Check if it's a network/CORS error (function not deployed)
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('CORS') || errorMessage.includes('not available')) {
          showError('GitHub account linked successfully! To complete setup, create a repository named "swft-thought-sessions" on GitHub. Go to https://github.com/new and create it manually.');
        } else {
          showError(`GitHub account linked, but failed to create repository: ${errorMessage}. Create "swft-thought-sessions" manually at https://github.com/new`);
        }
        await checkGitHubConnection();
      }
    } catch (error) {
      console.error('GitHub callback error:', error);
      showError('Failed to complete GitHub connection. Please try again.');
      
      // Clean up URL even on error
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  }

  /**
   * Check for OAuth callback in URL hash (Supabase redirects to hash)
   */
  async function checkForOAuthCallback() {
    if (!supabase) return;

    const urlHash = window.location.hash.substring(1);
    if (!urlHash) return;

    const hashParams = new URLSearchParams(urlHash);
    
    // Check if this is an OAuth callback
    if (hashParams.has('access_token') || hashParams.has('code')) {
      try {
        // Get session to verify OAuth completed
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session after OAuth:', error);
          return;
        }

        if (session && session.provider_token) {
          // Check if this is a GitHub OAuth
          const provider = session.user.user_metadata?.provider || 
                          session.user.app_metadata?.provider;
          
          if (provider === 'github') {
            console.log('GitHub OAuth callback detected, processing...');
            // Process the callback
            await handleGitHubCallback();
          }
        }
      } catch (error) {
        console.error('Error checking OAuth callback:', error);
      }
    }
  }

  /**
   * Disconnect GitHub account
   */
  async function disconnectGitHub() {
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) return;

      const { error } = await supabase
        .from('user_github_accounts')
        .update({ is_active: false })
        .eq('user_id', session.user.id);

      if (error) throw error;

      showGitHubLinkSection();
    } catch (error) {
      console.error('Error disconnecting GitHub:', error);
      showError('Failed to disconnect GitHub account. Please try again.');
    }
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

    // GitHub link button
    if (elements.linkGithubBtn) {
      elements.linkGithubBtn.addEventListener('click', linkGitHubAccount);
    }

    // GitHub disconnect button
    if (elements.githubDisconnectBtn) {
      elements.githubDisconnectBtn.addEventListener('click', disconnectGitHub);
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

    // Make sure loading and error are hidden on initial load
    hideLoading();
    hideError();

    // Setup event listeners
    setupEventListeners();

    // Setup auth state listener
    setupAuthListener();

    // Check for OAuth callback in URL hash first (Supabase redirects to hash)
    await checkForOAuthCallback();
    
    // Handle GitHub OAuth callback if present (query params)
    await handleGitHubCallback();

    // Check GitHub connection status if user is authenticated
    await checkGitHubConnection();

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
