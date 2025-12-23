/**
 * Cloudflare Pages Function: Sync Thought Session to GitHub
 * 
 * Syncs a thought session to user's GitHub repository with folder structure
 * 
 * Route: POST /api/github/sync-session
 * 
 * Body: {
 *   user_id: UUID,
 *   note_id: UUID,
 *   note_data: {
 *     id, title, messages, tags, created_at, updated_at
 *   }
 * }
 */

// Helper to add CORS headers
function addCorsHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

// Helper to encode content to base64
function encodeBase64(content) {
  return btoa(unescape(encodeURIComponent(content)));
}

// Helper to get file SHA if it exists
async function getFileSha(owner, repo, path, token) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SWFT-Studios'
      }
    });

    if (response.ok) {
      const data = await response.json();
      return data.sha;
    }
  } catch (error) {
    // File doesn't exist
  }
  return null;
}

// Helper to commit file to GitHub
async function commitFile(owner, repo, path, content, message, token, sha = null) {
  const payload = {
    message: message,
    content: encodeBase64(content),
    branch: 'main'
  };

  if (sha) {
    payload.sha = sha;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'SWFT-Studios'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

// Generate markdown for a message
function generateMessageMarkdown(message, index) {
  let md = `# Message ${index + 1}\n\n`;
  md += `**Created:** ${new Date(message.created_at).toISOString()}\n\n`;
  
  if (message.content) {
    md += `${message.content}\n\n`;
  }

  if (message.attachments && message.attachments.length > 0) {
    md += `## Attachments\n\n`;
    message.attachments.forEach((att, idx) => {
      if (att.type === 'image' && att.url) {
        md += `![${att.name || `Image ${idx + 1}`}](${att.url})\n\n`;
      } else if (att.type === 'audio' && att.url) {
        md += `[Audio: ${att.name || `Audio ${idx + 1}`}](${att.url})\n\n`;
      } else if (att.type === 'video' && att.url) {
        md += `[Video: ${att.name || `Video ${idx + 1}`}](${att.url})\n\n`;
      } else if (att.url) {
        md += `[${att.name || `File ${idx + 1}`}](${att.url})\n\n`;
      }
      
      if (att.transcription) {
        md += `**Transcription:**\n${att.transcription}\n\n`;
      }
    });
  }

  if (message.tags && message.tags.length > 0) {
    md += `**Tags:** ${message.tags.map(t => `\`${t}\``).join(', ')}\n\n`;
  }

  return md;
}

// Generate README for thought session
function generateSessionReadme(noteData) {
  let md = `# ${noteData.title}\n\n`;
  md += `**Created:** ${new Date(noteData.created_at).toISOString()}\n`;
  md += `**Updated:** ${new Date(noteData.updated_at).toISOString()}\n\n`;
  
  if (noteData.tags && noteData.tags.length > 0) {
    md += `**Tags:** ${noteData.tags.map(t => `\`${t}\``).join(', ')}\n\n`;
  }

  md += `## Messages\n\n`;
  md += `This thought session contains ${noteData.messages?.length || 0} message(s).\n\n`;
  md += `Each message is stored in the \`messages/\` directory.\n\n`;
  
  if (noteData.messages && noteData.messages.length > 0) {
    md += `### Message List\n\n`;
    noteData.messages.forEach((msg, idx) => {
      const preview = msg.content ? msg.content.substring(0, 100).replace(/\n/g, ' ') : 'No content';
      md += `${idx + 1}. [Message ${idx + 1}](./messages/message-${idx + 1}.md) - ${preview}...\n`;
    });
  }

  md += `\n---\n*Synced from SWFT Studios Thought Sessions*\n`;

  return md;
}

// Main handler
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { user_id, note_id, note_data } = body;

    if (!user_id || !note_id || !note_data) {
      return addCorsHeaders(new Response(JSON.stringify({
        error: 'user_id, note_id, and note_data are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const supabaseUrl = env.SUPABASE_URL || 'https://mnrteunavnzrglbozpfc.supabase.co';
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      throw new Error('Supabase service role key not configured');
    }

    // Get user's GitHub account info
    const githubResponse = await fetch(`${supabaseUrl}/rest/v1/user_github_accounts?user_id=eq.${user_id}&is_active=eq.true&select=github_username,github_access_token,repo_name`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!githubResponse.ok) {
      throw new Error(`Supabase error: ${githubResponse.status}`);
    }

    const githubAccounts = await githubResponse.json();
    if (!githubAccounts || githubAccounts.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({
        error: 'GitHub account not linked'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const githubAccount = githubAccounts[0];
    const { github_username, github_access_token, repo_name } = githubAccount;

    if (!github_access_token) {
      return addCorsHeaders(new Response(JSON.stringify({
        error: 'GitHub access token not found'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Create folder structure: thought-sessions/{session-id}/
    const sessionFolder = `thought-sessions/${note_id}`;
    const messagesFolder = `${sessionFolder}/messages`;
    const assetsFolder = `${sessionFolder}/assets`;

    const commits = [];
    const commitSha = `sync-${Date.now()}`;

    // 1. Create/update README.md
    const readmeContent = generateSessionReadme(note_data);
    const readmePath = `${sessionFolder}/README.md`;
    const readmeSha = await getFileSha(github_username, repo_name, readmePath, github_access_token);
    
    const readmeCommit = await commitFile(
      github_username,
      repo_name,
      readmePath,
      readmeContent,
      `Update: ${note_data.title}`,
      github_access_token,
      readmeSha
    );
    commits.push(readmeCommit.commit.sha);

    // 2. Create/update message files
    if (note_data.messages && note_data.messages.length > 0) {
      for (let i = 0; i < note_data.messages.length; i++) {
        const message = note_data.messages[i];
        const messageContent = generateMessageMarkdown(message, i);
        const messagePath = `${messagesFolder}/message-${i + 1}.md`;
        const messageSha = await getFileSha(github_username, repo_name, messagePath, github_access_token);

        const messageCommit = await commitFile(
          github_username,
          repo_name,
          messagePath,
          messageContent,
          `Add message ${i + 1} to ${note_data.title}`,
          github_access_token,
          messageSha
        );
        commits.push(messageCommit.commit.sha);
      }
    }

    // 3. Update sync log in database
    const syncLogResponse = await fetch(`${supabaseUrl}/rest/v1/github_sync_log`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        user_id: user_id,
        note_id: note_id,
        sync_status: 'synced',
        github_commit_sha: commits[0] || commitSha,
        synced_at: new Date().toISOString()
      })
    });

    // 4. Update note with sync status
    const noteUpdateResponse = await fetch(`${supabaseUrl}/rest/v1/notes?id=eq.${note_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        github_synced: true,
        github_path: `${sessionFolder}/`
      })
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      commit_sha: commits[0],
      commits: commits,
      repo_path: `${sessionFolder}/`,
      message: 'Thought session synced successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Sync error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      error: error.message || 'Failed to sync thought session'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

