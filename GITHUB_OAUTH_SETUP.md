# GitHub OAuth Setup for Supabase

## Issue
GitHub OAuth is showing a 404 error when trying to sign in. This means the GitHub OAuth app is not properly configured in Supabase.

## Solution

### Step 1: Create GitHub OAuth App

1. Go to: https://github.com/settings/developers
2. Click **"New OAuth App"** (or **"Register a new application"**)
3. Fill in the form:
   - **Application name**: `SWFT Notes` (or `SWFT Studios Website`)
   - **Homepage URL**: `https://swftstudios.com`
   - **Authorization callback URL**: `https://mnrteunavnzrglbozpfc.supabase.co/auth/v1/callback`
   - **Application description**: (optional) `SWFT Notes authentication`
4. Click **"Register application"**
5. **Copy the Client ID** (you'll need this)
6. Click **"Generate a new client secret"**
7. **Copy the Client Secret** (you'll only see this once!)

### Step 2: Configure in Supabase

1. Go to: https://supabase.com/dashboard/project/mnrteunavnzrglbozpfc/auth/providers
2. Find **"GitHub"** in the list
3. Click to enable/edit
4. Toggle **"Enable GitHub provider"** to ON
5. Enter:
   - **Client ID (for OAuth App)**: Paste the Client ID from GitHub
   - **Client Secret (for OAuth App)**: Paste the Client Secret from GitHub
6. Click **"Save"**

### Step 3: Verify Redirect URLs

Make sure these are in Supabase → Authentication → URL Configuration:
- `https://swftstudios.com/auth.html`
- `https://swftstudios.com/upload.html`
- `http://localhost:8000/auth.html` (for local dev)
- `http://localhost:8000/upload.html` (for local dev)

### Step 4: Test

1. Visit `https://swftstudios.com/auth.html`
2. Click **"Continue with GitHub"**
3. Should redirect to GitHub for authorization
4. After authorizing, should redirect back to your site

## Troubleshooting

### Still getting 404?
- Verify the **Authorization callback URL** in GitHub matches exactly: `https://mnrteunavnzrglbozpfc.supabase.co/auth/v1/callback`
- Check that Client ID and Secret are correctly pasted in Supabase (no extra spaces)
- Make sure GitHub OAuth app is **not** set to "Internal" if your repo is public

### Redirect loop after GitHub auth?
- Check that redirect URLs are added in Supabase
- Verify the redirect URL in code matches your domain

### "Invalid client" error?
- Client ID or Secret is incorrect
- Double-check both values in Supabase match GitHub
