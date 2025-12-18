# SWFT Notes Upload System - Setup Guide

## Overview

This guide explains how to set up and configure the content upload system for SWFT Notes.

## Prerequisites

1. **Supabase Project**: Already created (ID: mnrteunavnzrglbozpfc)
2. **GitHub Personal Access Token**: Needs `repo` scope for SWFTstudios/notes
3. **Authorized user emails**: Hardcoded in auth.js and submit-note.js

---

## 1. Supabase Setup

### Run SQL Scripts

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/mnrteunavnzrglbozpfc
2. Navigate to SQL Editor
3. Copy and run the contents of `supabase-setup.sql`
4. Verify tables and policies are created

### Configure Auth Providers

Already enabled:
- Email (magic link)
- GitHub OAuth

**Add Redirect URLs**:
1. Go to Authentication → URL Configuration
2. Add Site URL: `https://swftstudios.com`
3. Add Redirect URLs:
   - `http://localhost:8000/auth.html`
   - `http://localhost:8000/upload.html`
   - `https://swftstudios.com/auth.html`
   - `https://swftstudios.com/upload.html`

---

## 2. GitHub Setup

### Create Personal Access Token

1. Go to GitHub Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Set scopes:
   - ✅ `repo` (Full control of private repositories)
4. Generate and copy the token

**Token will be used in Cloudflare environment variables**

---

## 3. Cloudflare Pages Configuration

### Environment Variables

Add these in Cloudflare Pages Dashboard → Settings → Environment Variables:

**Production & Preview:**

```
VITE_SUPABASE_URL = https://mnrteunavnzrglbozpfc.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucnRldW5hdm56cmdsYm96cGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTM5NjUsImV4cCI6MjA4MTY2OTk2NX0.7XORw2dbCDG64i2HfiAaTt70ZJTg89BVO7DAPeSCsU8

SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucnRldW5hdm56cmdsYm96cGZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA5Mzk2NSwiZXhwIjoyMDgxNjY5OTY1fQ.injexZbb54zL3O71FOCwHqMF-zENrAF3Ym7auGuRKi8

GITHUB_TOKEN = <your_github_personal_access_token>
GITHUB_REPO_OWNER = SWFTstudios
GITHUB_REPO_NAME = notes

AUTHORIZED_USERS = elombe@swftstudios.com,elombekisala@gmail.com,stephen@swftstudios.com,stephen.iezzi@gmail.com
```

**Mark as secrets** (check the "Secret" checkbox):
- SUPABASE_SERVICE_ROLE_KEY
- GITHUB_TOKEN

---

## 4. Local Development Setup

### Install Dependencies

```bash
npm install
```

### Create Local Environment File

Create `.env.local`:

```
VITE_SUPABASE_URL=https://mnrteunavnzrglbozpfc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucnRldW5hdm56cmdsYm96cGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTM5NjUsImV4cCI6MjA4MTY2OTk2NX0.7XORw2dbCDG64i2HfiAaTt70ZJTg89BVO7DAPeSCsU8
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
GITHUB_TOKEN=<your_github_token>
GITHUB_REPO_OWNER=SWFTstudios
GITHUB_REPO_NAME=notes
AUTHORIZED_USERS=elombe@swftstudios.com,elombekisala@gmail.com,stephen@swftstudios.com,stephen.iezzi@gmail.com
```

### Run Local Server

```bash
# Start Cloudflare Pages dev server (with Functions support)
npx wrangler pages dev . --port 8000

# Or use a simple HTTP server (Functions won't work)
python -m http.server 8000
```

---

## 5. Testing the System

### Test Authentication

1. Open `http://localhost:8000/auth.html`
2. Sign in with authorized email (e.g., elombe@swftstudios.com)
3. Should redirect to `/upload.html`
4. Try with non-authorized email → should redirect to `/blog.html`

### Test Upload

1. After signing in, you should be on `/upload.html`
2. Try uploading:
   - Text note
   - Image file
   - Audio file
   - External link
3. Click "Publish Note"
4. Should show success message
5. Check GitHub repo for new markdown file
6. Wait 1-2 minutes for Cloudflare Pages rebuild
7. Refresh `/blog.html` to see new note

---

## 6. Troubleshooting

### Auth Not Working

**Symptom**: Can't sign in with email or GitHub

**Solutions**:
- Check Supabase redirect URLs are configured
- Verify email/GitHub auth is enabled in Supabase
- Check browser console for errors
- Try clearing cookies/localStorage

### Upload Fails

**Symptom**: "Failed to publish note" error

**Solutions**:
- Verify GitHub token has `repo` scope
- Check GitHub token is not expired
- Verify user email is in AUTHORIZED_USERS list
- Check Cloudflare Functions logs for errors

### Files Not Uploading to Supabase

**Symptom**: File upload fails

**Solutions**:
- Verify storage buckets exist (`notes-audio`, `notes-images`, `notes-files`)
- Check storage policies are configured
- Verify file size is within limits (10MB images, 50MB audio)
- Check file type is allowed

### Notes Not Appearing in Blog

**Symptom**: Note uploaded but doesn't show in blog

**Solutions**:
- Check if markdown file was created in GitHub repo
- Verify Cloudflare Pages build triggered (check dashboard)
- Wait for build to complete (1-2 minutes)
- Run `npm run build` locally to test data generation
- Check `data/posts.json` for new note

---

## 7. Adding New Authorized Users

### Method 1: Add to Hardcoded List

**Update in**:
1. `js/auth.js` - Line ~29 (CONFIG.authorizedUsers array)
2. `functions/api/submit-note.js` - Line ~27 (authorizedUsers array)
3. Add to `AUTHORIZED_USERS` environment variable in Cloudflare

### Method 2: Invite as GitHub Collaborator (Future)

1. Add user as collaborator to https://github.com/SWFTstudios/notes
2. System will automatically detect via GitHub API

---

## 8. Security Checklist

- [ ] SUPABASE_SERVICE_ROLE_KEY is marked as secret in Cloudflare
- [ ] GITHUB_TOKEN is marked as secret in Cloudflare
- [ ] Supabase RLS policies are enabled on `notes` table
- [ ] Storage policies restrict uploads to authenticated users
- [ ] File type validation is enforced client and server-side
- [ ] File size limits are enforced
- [ ] Auth redirect URLs are properly configured

---

## 9. Deployment Checklist

Before deploying to production:

- [ ] Run Supabase SQL setup scripts
- [ ] Create storage buckets in Supabase
- [ ] Configure auth providers and redirect URLs
- [ ] Add environment variables to Cloudflare Pages
- [ ] Test authentication flow
- [ ] Test file uploads
- [ ] Test note creation and GitHub commits
- [ ] Verify site rebuilds after note creation
- [ ] Test with all authorized user emails

---

## 10. Monitoring

### What to Monitor

- **Supabase Dashboard**:
  - Storage usage
  - Database size
  - Auth user count
  
- **Cloudflare Pages**:
  - Build success rate
  - Function invocation count
  - Errors in Functions logs
  
- **GitHub**:
  - API rate limit usage
  - Commit history in notes repo

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Magic link not received | Email provider blocking | Check spam, verify email in Supabase |
| Upload fails silently | Missing environment variables | Check Cloudflare env vars |
| GitHub commit fails | API rate limit | Wait or upgrade GitHub plan |
| Files too large | Exceeded Supabase limits | Upgrade Supabase plan or reduce file size |

---

## Contact

For issues or questions:
- Email: hello@swftstudios.com
- GitHub: https://github.com/SWFTstudios/notes/issues
