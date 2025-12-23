/**
 * Cloudflare Pages Function: Check GitHub Repository Status
 * 
 * Checks if user has a GitHub repository for thought sessions
 * 
 * Route: GET /api/github/repo-status
 * 
 * Query params: user_id (required)
 */

// Helper to add CORS headers
function addCorsHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

// Handle OPTIONS request
export async function onRequestOptions() {
  return addCorsHeaders(new Response(null, { status: 204 }));
}

// GET /api/github/repo-status
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const supabaseUrl = env.SUPABASE_URL || 'https://mnrteunavnzrglbozpfc.supabase.co';
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      throw new Error('Supabase service role key not configured');
    }

    // Get user_id from query params (should be passed from frontend with auth)
    const userId = url.searchParams.get('user_id');
    if (!userId) {
      return addCorsHeaders(new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Query Supabase for GitHub account
    const response = await fetch(`${supabaseUrl}/rest/v1/user_github_accounts?user_id=eq.${userId}&is_active=eq.true&select=repo_name,repo_url,github_username`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`);
    }

    const data = await response.json();
    const hasRepo = data && data.length > 0;

    return addCorsHeaders(new Response(JSON.stringify({
      has_repo: hasRepo,
      repo: hasRepo ? data[0] : null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Repo status error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      error: error.message || 'Failed to check repo status'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

