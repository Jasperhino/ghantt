# GitHub App Setup Guide

This app can work in two modes:
1. **OAuth Only** - Simple authentication, works with private repos
2. **GitHub App** - Better rate limits, installation-based access

## Quick Start (OAuth Only)

1. Create a new OAuth App at https://github.com/settings/applications/new
   - Application name: `gh-gantt` 
   - Homepage URL: `http://localhost:3001`
   - Authorization callback URL: `http://localhost:3001/api/auth/callback`

2. Copy the Client ID and generate a Client Secret

3. Create `.env` file:
```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
APP_URL=http://localhost:3001
```

4. Run the app:
```bash
bun install
bun run dev
```

5. Click "Sign in with GitHub" in the app

## Full GitHub App Setup (Recommended for Production)

1. Create a GitHub App at https://github.com/settings/apps/new
   - **GitHub App name**: `gh-gantt`
   - **Homepage URL**: Your app URL
   - **Callback URL**: `https://your-app.com/api/auth/callback`
   - **Webhook URL**: Optional, `https://your-app.com/api/webhooks`
   - **Webhook secret**: Generate a random string
   
   **Permissions**:
   - Repository permissions:
     - Actions: Read
     - Contents: Read (if needed)
     - Metadata: Read
   
   - Account permissions: None
   
   **Where can this GitHub App be installed?**: Any account

2. After creation:
   - Note your App ID
   - Generate a private key (downloads .pem file)
   - Copy Client ID and generate Client Secret

3. Create `.env` file:
```bash
# OAuth
GITHUB_CLIENT_ID=Iv1.abc123
GITHUB_CLIENT_SECRET=abc123secret

# GitHub App
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----"

# Optional
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# App URL
APP_URL=https://your-app.com
```

4. Install the app on your repos:
   - Go to https://github.com/settings/apps/your-app-name/installations
   - Click "Install" and select repositories

## Deployment

### Vercel/Netlify (Frontend only)

1. Build the frontend:
```bash
bun run build
```

2. Deploy the `dist` folder

3. Set up a separate backend on Railway/Fly.io/Render

### Railway/Fly.io/Render (Full stack)

1. Set environment variables from `.env`

2. Deploy with:
```bash
NODE_ENV=production bun run start
```

The server will serve both API and static files in production mode.

### Docker

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY . .
RUN bun run build
ENV NODE_ENV=production
CMD ["bun", "run", "start"]
```

## Security Notes

- Never commit `.env` files
- Use environment variables in production
- Rotate secrets regularly
- Use HTTPS in production
- Consider implementing rate limiting
- Use a proper session store (Redis) in production

## Troubleshooting

### "Not authenticated"
- Check your CLIENT_ID and CLIENT_SECRET
- Ensure callback URL matches exactly
- Clear browser cookies and try again

### "Rate limit exceeded"
- Install as a GitHub App for higher rate limits
- Implement caching for API responses

### "Cannot read private repos"
- Ensure OAuth scope includes `repo`
- For GitHub App, check repository permissions