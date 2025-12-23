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

// Helper to get file type label from filename or URL
function getFileTypeLabel(filename, url) {
  const name = filename || url || '';
  const ext = name.split('.').pop().toLowerCase();
  
  const typeMap = {
    // Documents
    'pdf': 'PDF Document',
    'docx': 'Word Document',
    'doc': 'Word Document',
    'xlsx': 'Excel Spreadsheet',
    'xls': 'Excel Spreadsheet',
    'pptx': 'PowerPoint Presentation',
    'ppt': 'PowerPoint Presentation',
    'txt': 'Text Document',
    'rtf': 'Rich Text Format',
    'odt': 'OpenDocument Text',
    'ods': 'OpenDocument Spreadsheet',
    'odp': 'OpenDocument Presentation',
    // Images
    'jpg': 'Image',
    'jpeg': 'Image',
    'png': 'Image',
    'gif': 'Image',
    'webp': 'Image',
    'svg': 'Image',
    'bmp': 'Image',
    'ico': 'Image',
    // Videos
    'mp4': 'Video',
    'mov': 'Video',
    'webm': 'Video',
    'avi': 'Video',
    'mkv': 'Video',
    'flv': 'Video',
    'wmv': 'Video',
    // Audio
    'mp3': 'Audio',
    'wav': 'Audio',
    'm4a': 'Audio',
    'aac': 'Audio',
    'ogg': 'Audio',
    'flac': 'Audio',
    'wma': 'Audio',
  };
  
  return typeMap[ext] || 'File';
}

// Helper to determine primary category from attachments
function getPrimaryCategory(attachments, content) {
  if (!attachments || attachments.length === 0) {
    return content ? 'text' : 'text';
  }
  
  // Count attachment types
  const typeCounts = {};
  attachments.forEach(att => {
    const type = att.type || 'file';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  
  // Return most common type
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'file';
}

// Generate markdown for a message
function generateMessageMarkdown(message, index) {
  const timestamp = message.created_at ? new Date(message.created_at).toISOString() : new Date().toISOString();
  const primaryCategory = getPrimaryCategory(message.attachments, message.content);
  
  // Collect file types from attachments
  const fileTypes = [];
  if (message.attachments && message.attachments.length > 0) {
    message.attachments.forEach(att => {
      const fileType = getFileTypeLabel(att.name, att.url);
      if (fileType && !fileTypes.includes(fileType)) {
        fileTypes.push(fileType);
      }
    });
  }
  
  let md = `# Message ${index + 1}\n\n`;
  md += `**Timestamp:** ${timestamp}\n`;
  md += `**Category:** ${primaryCategory}\n`;
  if (fileTypes.length > 0) {
    md += `**File Types:** ${fileTypes.join(', ')}\n`;
  }
  md += `\n`;
  
  // Content section
  if (message.content) {
    md += `## Content\n\n`;
    md += `${message.content}\n\n`;
  }
  
  // Attachments section - organized by type
  if (message.attachments && message.attachments.length > 0) {
    md += `## Attachments\n\n`;
    
    // Group attachments by type
    const images = [];
    const videos = [];
    const audio = [];
    const files = [];
    const urls = [];
    
    message.attachments.forEach(att => {
      const type = att.type || 'file';
      if (type === 'image') {
        images.push(att);
      } else if (type === 'video') {
        videos.push(att);
      } else if (type === 'audio') {
        audio.push(att);
      } else if (type === 'url' || att.url?.startsWith('http')) {
        urls.push(att);
      } else {
        files.push(att);
      }
    });
    
    // Images
    if (images.length > 0) {
      md += `### Images\n\n`;
      images.forEach((att, idx) => {
        const fileType = getFileTypeLabel(att.name, att.url);
        md += `- ![${att.name || `Image ${idx + 1}`}](${att.url})`;
        if (att.name) {
          md += ` - ${att.name}`;
        }
        md += ` (${fileType})\n\n`;
      });
    }
    
    // Videos
    if (videos.length > 0) {
      md += `### Videos\n\n`;
      videos.forEach((att, idx) => {
        const fileType = getFileTypeLabel(att.name, att.url);
        const duration = att.duration ? ` - ${att.duration}` : '';
        md += `- [Video: ${att.name || `Video ${idx + 1}`}](${att.url})${duration} (${fileType})\n\n`;
      });
    }
    
    // Audio
    if (audio.length > 0) {
      md += `### Audio\n\n`;
      audio.forEach((att, idx) => {
        const fileType = getFileTypeLabel(att.name, att.url);
        const duration = att.duration ? ` - ${att.duration}` : '';
        md += `- [Audio: ${att.name || `Audio ${idx + 1}`}](${att.url})${duration} (${fileType})\n\n`;
      });
    }
    
    // Files
    if (files.length > 0) {
      md += `### Files\n\n`;
      files.forEach((att, idx) => {
        const fileType = getFileTypeLabel(att.name, att.url);
        md += `- [${att.name || `File ${idx + 1}`}](${att.url}) - ${fileType}\n\n`;
      });
    }
    
    // URLs
    if (urls.length > 0) {
      md += `### URLs\n\n`;
      urls.forEach((att, idx) => {
        const title = att.name || att.title || att.url || `URL ${idx + 1}`;
        md += `- [${title}](${att.url})\n\n`;
      });
    }
  }
  
  // Transcription section
  if (message.attachments && message.attachments.some(att => att.transcription)) {
    md += `## Transcription\n\n`;
    message.attachments.forEach(att => {
      if (att.transcription) {
        md += `${att.transcription}\n\n`;
      }
    });
  }
  
  // Tags
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
  md += `Each message is stored as a timestamped markdown file in this directory.\n\n`;
  
  if (noteData.messages && noteData.messages.length > 0) {
    md += `### Message List\n\n`;
    noteData.messages.forEach((msg, idx) => {
      const timestamp = msg.created_at ? new Date(msg.created_at).toISOString() : new Date().toISOString();
      const timestampStr = timestamp.replace(/[:.]/g, '-').replace('T', '-').split('.')[0];
      const filename = `message-${timestampStr}-${idx}.md`;
      const preview = msg.content ? msg.content.substring(0, 100).replace(/\n/g, ' ') : 'No content';
      md += `${idx + 1}. [Message ${idx + 1}](./${filename}) - ${preview}...\n`;
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

    // Create folder structure: Thought Sessions/{session-id}/
    const sessionFolder = `Thought Sessions/${note_id}`;
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

    // 2. Create/update message files with timestamped filenames
    if (note_data.messages && note_data.messages.length > 0) {
      for (let i = 0; i < note_data.messages.length; i++) {
        const message = note_data.messages[i];
        const timestamp = message.created_at ? new Date(message.created_at).toISOString() : new Date().toISOString();
        // Format timestamp for filename: YYYY-MM-DDTHH-mm-ss-sssZ
        const timestampStr = timestamp.replace(/[:.]/g, '-').replace('T', '-').split('.')[0] + 'Z';
        const messageFilename = `message-${timestampStr}-${i}.md`;
        const messageContent = generateMessageMarkdown(message, i);
        const messagePath = `${sessionFolder}/${messageFilename}`;
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

