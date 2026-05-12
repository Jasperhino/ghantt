# Testing Guide - GitHub App Setup

## Step 1: Create GitHub OAuth App (5 minutes)

1. Go to https://github.com/settings/applications/new
2. Fill in the form:
   - **Application name**: `ghantt-local-test`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3001/api/auth/callback`
   - **Enable Device Flow**: Leave unchecked
3. Click "Register application"
4. On the next page:
   - Copy the **Client ID**
   - Click "Generate a new client secret"
   - Copy the **Client Secret** (you won't see it again!)

## Step 2: Set Up Local Environment

1. Clone and switch to the github-app branch:
```bash
cd /Users/jasper/Work/gh-gantt-app-github-app
```

2. Create `.env` file:
```bash
cat > .env << 'EOF'
GITHUB_CLIENT_ID=Iv1.your_client_id_here
GITHUB_CLIENT_SECRET=your_secret_here
APP_URL=http://localhost:3001
PORT=3001
EOF
```

3. Replace the values with your actual Client ID and Secret from Step 1

## Step 3: Test Locally

1. Install dependencies and run:
```bash
bun install
bun run dev
```

2. Open http://localhost:3000 in your browser

3. Test the flow:
   - Click "Sign in with GitHub"
   - You'll be redirected to GitHub to authorize
   - After authorizing, you'll be redirected back
   - Try loading a run from one of your repos
   - Test with both public and private repos

## Step 4: Deploy to Production (Choose One)

### Option A: Deploy to Railway (Recommended - Easiest)

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Deploy:
```bash
# From the gh-gantt-app-github-app directory
railway login
railway init
railway up

# Set environment variables
railway variables set GITHUB_CLIENT_ID=your_client_id
railway variables set GITHUB_CLIENT_SECRET=your_secret
railway variables set APP_URL=https://your-app.up.railway.app
railway variables set NODE_ENV=production
```

3. Update your GitHub OAuth App:
   - Go to https://github.com/settings/applications
   - Edit your app
   - Update Homepage URL to your Railway URL
   - Update Callback URL to `https://your-app.up.railway.app/api/auth/callback`

### Option B: Deploy to Fly.io

1. Install Fly CLI and sign up:
```bash
curl -L https://fly.io/install.sh | sh
fly auth signup
```

2. Create `fly.toml`:
```toml
app = "ghantt"
primary_region = "sjc"

[build]
  builder = "oven/bun:1"
  buildpacks = []

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3001
  force_https = true
```

3. Deploy:
```bash
fly launch
fly secrets set GITHUB_CLIENT_ID=your_client_id
fly secrets set GITHUB_CLIENT_SECRET=your_secret
fly secrets set APP_URL=https://ghantt.fly.dev
fly deploy
```

### Option C: Deploy to Vercel (Frontend) + Railway (Backend)

This requires splitting the app - more complex but scales better.

## Step 5: Create Full GitHub App (Optional - For Better Rate Limits)

If you want the full GitHub App experience with installations:

1. Go to https://github.com/settings/apps/new

2. Fill in:
   - **GitHub App name**: `ghantt-app`
   - **Homepage URL**: Your deployed URL
   - **Callback URL**: `https://your-app.com/api/auth/callback`
   - **Setup URL**: Leave blank
   - **Webhook URL**: `https://your-app.com/api/webhooks` (optional)
   - **Webhook secret**: Generate a random string

3. Permissions:
   - **Repository permissions**:
     - Actions: Read
     - Contents: Read (if needed)
     - Metadata: Read
   - **Account permissions**: None
   - **Subscribe to events**: None (unless you want webhooks)

4. Where can this GitHub App be installed?
   - Choose "Any account"

5. Create the app, then:
   - Note the **App ID**
   - Generate a **Private Key** (downloads a .pem file)
   - Get the **Client ID** and generate a **Client Secret**

6. Update your `.env`:
```bash
# OAuth
GITHUB_CLIENT_ID=Iv1.abc123
GITHUB_CLIENT_SECRET=secret123

# GitHub App
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAK...
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=webhook_secret_here
```

7. Install the app:
   - Go to https://github.com/settings/apps/your-app/installations
   - Click "Install" and choose repositories

## Testing Checklist

- [ ] OAuth login works
- [ ] Can load public repo runs without auth
- [ ] Can load private repo runs after auth
- [ ] Session persists across page refreshes
- [ ] Logout works
- [ ] Compare mode works
- [ ] Branch view loads multiple runs
- [ ] Matrix job grouping works
- [ ] No-queue toggle works

## Troubleshooting

### "Not authenticated"
- Check CLIENT_ID and CLIENT_SECRET are correct
- Ensure callback URL matches exactly
- Clear cookies and try again

### "404 Not Found" on runs
- Make sure you're signed in
- Check the repo exists and you have access
- For private repos, ensure the OAuth app has `repo` scope

### "Rate limit exceeded"
- Basic OAuth has 5000 requests/hour
- GitHub App installations have 15000 requests/hour
- Consider implementing caching

### Deploy issues
- Make sure all environment variables are set
- Check logs: `railway logs`, `fly logs`, etc.
- Ensure NODE_ENV=production for serving static files

## Quick Test URLs

Once deployed, test with these:
- Public repo: https://github.com/facebook/react/actions/runs/11219429480
- Your repos: Check your own GitHub profile for recent runs

## Security Notes

- Never commit `.env` files
- Rotate secrets if exposed
- Use HTTPS in production
- Consider adding rate limiting for public deployment