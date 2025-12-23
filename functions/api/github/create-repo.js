/**
 * Cloudflare Pages Function: Create GitHub Repository
 * 
 * Creates a user's thought sessions repository on GitHub
 * 
 * Route: POST /api/github/create-repo
 * 
 * Body: {
 *   github_token: string,
 *   github_username: string,
 *   user_id: string (optional)
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

// POST /api/github/create-repo
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { github_token, github_username, user_id } = body;

    if (!github_token || !github_username) {
      return addCorsHeaders(new Response(JSON.stringify({
        error: 'github_token and github_username required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Create repository name (fixed name for all users)
    const repoName = 'swft-thought-sessions';
    const repoDescription = 'Private repository for Thought Sessions - automatically synced from SWFT Studios';

    // Create GitHub repository
    const createRepoResponse = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `token ${github_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'SWFT-Studios'
      },
      body: JSON.stringify({
        name: repoName,
        description: repoDescription,
        private: true,
        auto_init: true,
        gitignore_template: 'Node',
        license_template: null
      })
    });

    if (!createRepoResponse.ok) {
      const errorText = await createRepoResponse.text();
      
      // If repo already exists, that's okay - return existing repo info
      if (createRepoResponse.status === 422) {
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.errors && errorJson.errors.some(e => e.message && e.message.includes('already exists'))) {
            // Repo exists, get its info
            const getRepoResponse = await fetch(`https://api.github.com/repos/${github_username}/swft-thought-sessions`, {
              headers: {
                'Authorization': `token ${github_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'SWFT-Studios'
              }
            });

            if (getRepoResponse.ok) {
              const repoData = await getRepoResponse.json();
              return addCorsHeaders(new Response(JSON.stringify({
                repo_name: repoData.name,
                repo_url: repoData.html_url,
                message: 'Repository already exists'
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              }));
            }
          }
        } catch (e) {
          // Fall through to error
        }
      }

      throw new Error(`GitHub API error: ${createRepoResponse.status} - ${errorText}`);
    }

    const repoData = await createRepoResponse.json();

    // Create initial README.md
    const readmeContent = `# ${repoName}

${repoDescription}

## About

This repository is automatically synced from your SWFT Studios Thought Sessions. Each thought session is stored as a folder with markdown files and assets.

## Structure

\`\`\`
Thought Sessions/
  {session-id}/
    README.md (session metadata)
    message-{timestamp}-{index}.md (individual messages)
    assets/
      images/
        (image files)
      videos/
        (video files)
      audio/
        (audio files)
      files/
        (PDF, Word, Excel, PowerPoint, etc.)
\`\`\`

Each thought session is automatically synced when created or updated. Messages are timestamped and can contain multiple content types (text, images, videos, audio, URLs, and various file types).

## Privacy

This repository is private by default. You can change its visibility in GitHub settings if you want to make specific thought sessions public.

---

*Automatically created by SWFT Studios*
`;

    // Commit README.md
    const readmeBase64 = btoa(unescape(encodeURIComponent(readmeContent)));
    await fetch(`https://api.github.com/repos/${github_username}/swft-thought-sessions/contents/README.md`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${github_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'SWFT-Studios'
      },
      body: JSON.stringify({
        message: 'Initial commit: Add README',
        content: readmeBase64,
        branch: 'main'
      })
    }).catch(err => {
      // Ignore README commit errors - repo creation is the important part
      console.warn('Failed to create README:', err);
    });

    return addCorsHeaders(new Response(JSON.stringify({
      repo_name: repoData.name,
      repo_url: repoData.html_url,
      message: 'Repository created successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Create repo error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      error: error.message || 'Failed to create repository'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

