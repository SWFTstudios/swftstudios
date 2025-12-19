/**
 * Cloudflare Pages Function: Submit Note
 * 
 * Processes note uploads and commits to GitHub notes repo
 * 
 * Route: /api/submit-note
 * Method: POST
 * 
 * Body: {
 *   title, content, markdown, tags, contentType, 
 *   fileUrl, externalLink, userEmail
 * }
 * 
 * This function is located at: functions/api/submit-note.js
 * Cloudflare Pages automatically maps this to: /api/submit-note
 */

// Helper to slugify text
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Helper to check if user is authorized
function isAuthorizedUser(email, env) {
  const authorizedUsers = env.AUTHORIZED_USERS 
    ? env.AUTHORIZED_USERS.split(',').map(e => e.trim().toLowerCase())
    : [
        'elombe@swftstudios.com',
        'elombekisala@gmail.com',
        'stephen@swftstudios.com',
        'stephen.iezzi@gmail.com'
      ];
  
  return authorizedUsers.includes(email.toLowerCase().trim());
}

// Commit file to GitHub
async function commitToGitHub(filename, content, commitMessage, env) {
  const owner = env.GITHUB_REPO_OWNER || 'SWFTstudios';
  const repo = env.GITHUB_REPO_NAME || 'notes';
  const token = env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('GitHub token not configured');
  }

  // Check if file exists
  const checkUrl = `https://api.github.com/repos/${owner}/${repo}/contents/notes/${filename}`;
  let sha = null;

  try {
    const checkResponse = await fetch(checkUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SWFT-Notes'
      }
    });

    if (checkResponse.ok) {
      const existingFile = await checkResponse.json();
      sha = existingFile.sha;
    }
  } catch (error) {
    // File doesn't exist, that's okay
  }

  // Create or update file
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/notes/${filename}`;
  const payload = {
    message: commitMessage,
    content: btoa(unescape(encodeURIComponent(content))), // UTF-8 to base64
    branch: 'main'
  };

  if (sha) {
    payload.sha = sha; // Include SHA for updates
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'SWFT-Notes'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

// Main handler
export async function onRequestPost(context) {
  const { request, env } = context;

  // #region agent log
  try {
    await fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submit-note.js:108',message:'Function invoked',data:{method:request.method,url:request.url,hasBody:!!request.body},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  } catch (logErr) {
    // Ignore logging errors
  }
  // #endregion

  try {
    // Parse request body
    // #region agent log
    let body;
    try {
      body = await request.json();
      await fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submit-note.js:115',message:'Parsed request body',data:{bodyKeys:Object.keys(body),hasTitle:!!body.title,hasContent:!!body.content,hasUserEmail:!!body.userEmail},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    } catch (jsonParseError) {
      await fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submit-note.js:118',message:'Failed to parse request JSON',data:{error:jsonParseError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      return addCorsHeaders(new Response(JSON.stringify({ error: `Invalid JSON in request body: ${jsonParseError.message}` }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
    // #endregion
    const { title, content, markdown, tags, contentType, userEmail } = body;

    // Validate required fields
    if (!title && !content) {
      return addCorsHeaders(new Response(JSON.stringify({
        error: 'Title or content is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    if (!userEmail) {
      return addCorsHeaders(new Response(JSON.stringify({
        error: 'User email is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Check authorization
    if (!isAuthorizedUser(userEmail, env)) {
      return addCorsHeaders(new Response(JSON.stringify({
        error: 'Unauthorized: You do not have permission to upload notes'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const slug = slugify(title || 'note');
    const filename = `${timestamp}-${slug}.md`;

    // Commit to GitHub
    const commitMessage = `Add note: ${title || 'Untitled'} (by ${userEmail})`;
    
    // #region agent log
    await fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submit-note.js:153',message:'Calling commitToGitHub',data:{filename,hasMarkdown:!!markdown},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const result = await commitToGitHub(
      filename,
      markdown,
      commitMessage,
      env
    );

    // #region agent log
    await fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submit-note.js:161',message:'GitHub commit successful, returning response',data:{filename,hasResult:!!result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Return success
    const successResponse = JSON.stringify({
      success: true,
      message: 'Note published successfully',
      filename,
      commit: result.content.sha,
      url: result.content.html_url
    });
    // #region agent log
    await fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submit-note.js:170',message:'Returning success response',data:{status:200,bodyLength:successResponse.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return addCorsHeaders(new Response(successResponse, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Submit note error:', error);
    // #region agent log
    await fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submit-note.js:177',message:'Unhandled exception in function',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    const errorResponse = JSON.stringify({
      error: error.message || 'Failed to process note',
      details: error.stack
    });
    // #region agent log
    await fetch('http://127.0.0.1:7244/ingest/d96b9dad-13b4-4f43-9321-0f9f21accf4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submit-note.js:183',message:'Returning error response',data:{status:500,bodyLength:errorResponse.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return addCorsHeaders(new Response(errorResponse, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Handle OPTIONS for CORS
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

// Add CORS headers to all responses
function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
