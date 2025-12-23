# GitHub Thought Sessions Integration Setup Guide

## Overview

This guide explains how to set up the GitHub integration for Thought Sessions, allowing users to automatically sync their thought sessions to private GitHub repositories.

## Prerequisites

1. **Supabase Project**: Already created (ID: mnrteunavnzrglbozpfc)
2. **GitHub OAuth App**: Needs to be configured in Supabase
3. **Cloudflare Pages**: Environment variables need to be configured

---

## 1. Database Setup

### Run SQL Migration

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/mnrteunavnzrglbozpfc
2. Navigate to SQL Editor
3. Copy and run the contents of `supabase-github-integration.sql`
4. Verify tables are created:
   - `user_github_accounts`
   - `github_sync_log`
   - Columns added to `notes` table: `github_synced`, `github_path`

---

## 2. GitHub OAuth Configuration

### Step 1: Verify GitHub OAuth App in Supabase

1. Go to: https://supabase.com/dashboard/project/mnrteunavnzrglbozpfc/auth/providers
2. Find **"GitHub"** in the list
3. Ensure it's enabled with:
   - **Client ID**: Your GitHub OAuth App Client ID
   - **Client Secret**: Your GitHub OAuth App Client Secret
4. **Important**: Make sure the OAuth app has `repo` scope enabled

### Step 2: Update GitHub OAuth App Scopes

1. Go to: https://github.com/settings/developers
2. Select your OAuth App
3. Ensure the app has the following scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `user:email` (Access user email addresses)

---

## 3. Cloudflare Pages Configuration

### Environment Variables

Add these in Cloudflare Pages Dashboard → Settings → Environment Variables:

**Production & Preview:**

```
SUPABASE_URL=https://mnrteunavnzrglbozpfc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Note**: The `SUPABASE_SERVICE_ROLE_KEY` is needed for server-side database access in Cloudflare Functions. Get it from:
- Supabase Dashboard → Settings → API → `service_role` key (keep this secret!)

---

## 4. How It Works

### User Flow

1. **Sign Up**: User creates account with email/password
2. **Link GitHub**: User clicks "Link GitHub Account" button
3. **OAuth Flow**: User authorizes app on GitHub
4. **Repo Creation**: System automatically creates `{username}-thought-sessions` repo
5. **Auto Sync**: When user creates/updates thought sessions, they're synced to GitHub

### Repository Structure

Each thought session is stored as:

```
thought-sessions/
  {session-id}/
    README.md (session metadata)
    messages/
      message-1.md
      message-2.md
    assets/
      (small files stored here)
```

### File Storage Strategy

- **Small files (< 1MB)**: Stored directly in GitHub repo `assets/` folder
- **Large files**: Stored in Supabase Storage, referenced in markdown
- **Images**: Optimized and stored in repo when possible
- **Audio/Video**: Stored in Supabase, linked in markdown

---

## 5. API Endpoints

### POST /api/github/create-repo

Creates a user's thought sessions repository.

**Request Body**:
```json
{
  "github_token": "user_github_token",
  "github_username": "username",
  "user_id": "uuid"
}
```

**Response**:
```json
{
  "repo_name": "username-thought-sessions",
  "repo_url": "https://github.com/username/username-thought-sessions",
  "message": "Repository created successfully"
}
```

### POST /api/github/sync-session

Syncs a thought session to GitHub.

**Request Body**:
```json
{
  "user_id": "uuid",
  "note_id": "uuid",
  "note_data": {
    "id": "uuid",
    "title": "Session Title",
    "messages": [...],
    "tags": [...],
    "created_at": "ISO date",
    "updated_at": "ISO date"
  }
}
```

**Response**:
```json
{
  "success": true,
  "commit_sha": "abc123",
  "repo_path": "thought-sessions/session-id/",
  "message": "Thought session synced successfully"
}
```

### GET /api/github/repo-status

Checks if user has a GitHub repo.

**Query Params**:
- `user_id`: User UUID

**Response**:
```json
{
  "has_repo": true,
  "repo": {
    "repo_name": "username-thought-sessions",
    "repo_url": "https://github.com/username/username-thought-sessions",
    "github_username": "username"
  }
}
```

---

## 6. Security Considerations

1. **Token Storage**: GitHub access tokens are stored in Supabase `user_github_accounts` table
   - **Note**: In production, consider encrypting tokens at rest
   - Currently stored as plain text (acceptable for MVP)

2. **RLS Policies**: Row-level security ensures users can only access their own GitHub data

3. **API Calls**: All GitHub API calls happen server-side in Cloudflare Functions

4. **Rate Limiting**: GitHub API has rate limits (5000 requests/hour for authenticated users)

5. **Error Handling**: System gracefully handles GitHub API failures

---

## 7. Testing

### Test GitHub OAuth Flow

1. Visit `/auth.html`
2. Sign in with email/password
3. Click "Link GitHub Account"
4. Authorize on GitHub
5. Verify repo is created: `https://github.com/{username}/{username}-thought-sessions`

### Test Sync

1. Create a new thought session
2. Add messages and attachments
3. Check sync status indicator
4. Verify files appear in GitHub repo

### Test Error Scenarios

1. Disconnect GitHub account
2. Try to sync (should show "Not connected")
3. Reconnect and verify sync works

---

## 8. Troubleshooting

### GitHub OAuth Not Working

- Verify OAuth app callback URL matches Supabase: `https://mnrteunavnzrglbozpfc.supabase.co/auth/v1/callback`
- Check that `repo` scope is enabled
- Verify Client ID and Secret in Supabase

### Repo Creation Fails

- Check GitHub token has `repo` scope
- Verify username is correct
- Check GitHub API rate limits

### Sync Fails

- Verify user has GitHub account linked
- Check Cloudflare Function logs
- Verify Supabase service role key is configured
- Check note data structure matches expected format

### Files Not Syncing

- Large files (>1MB) are stored in Supabase, not GitHub
- Check file URLs in markdown are accessible
- Verify Supabase Storage buckets are configured

---

## 9. Future Enhancements

- [ ] Encrypt GitHub tokens at rest
- [ ] Add batch sync for multiple sessions
- [ ] Add sync history/audit log
- [ ] Support for public/private repo toggle per session
- [ ] Add GitHub webhook for two-way sync
- [ ] Support for GitHub Releases for major milestones
- [ ] Add sync conflict resolution

---

## Support

For issues or questions, check:
- Cloudflare Function logs in Cloudflare Dashboard
- Supabase logs in Supabase Dashboard
- Browser console for frontend errors

