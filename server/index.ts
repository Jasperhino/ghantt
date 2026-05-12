import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { App, Octokit } from 'octokit'
import jwt from 'jsonwebtoken'

const app = new Hono()
app.use('*', cors())

// GitHub App configuration
const GITHUB_APP_ID = process.env.GITHUB_APP_ID!
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n')!
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET
const APP_URL = process.env.APP_URL || 'http://localhost:3001'

// In-memory session store (use Redis/DB in production)
const sessions = new Map<string, { token: string; installations?: number[] }>()

// Initialize GitHub App
let githubApp: App | null = null
if (GITHUB_APP_ID && GITHUB_PRIVATE_KEY) {
  githubApp = new App({
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_PRIVATE_KEY,
    webhooks: GITHUB_WEBHOOK_SECRET ? { secret: GITHUB_WEBHOOK_SECRET } : undefined,
  })
}

// Helper to get Octokit instance for a user or installation
async function getOctokit(c: any): Promise<Octokit> {
  const sessionId = c.req.header('x-session-id')
  const installationId = c.req.header('x-installation-id')
  
  if (installationId && githubApp) {
    // Use installation token for GitHub App
    return await githubApp.getInstallationOctokit(parseInt(installationId))
  }
  
  if (sessionId && sessions.has(sessionId)) {
    // Use user's OAuth token
    const session = sessions.get(sessionId)!
    return new Octokit({ auth: session.token })
  }
  
  // Fallback to unauthenticated (public repos only)
  return new Octokit()
}

app.get('/api/health', (c) => c.json({ 
  ok: true, 
  ts: Date.now(),
  hasApp: !!githubApp,
  authenticated: false 
}))

// OAuth flow - start
app.get('/api/auth/login', (c) => {
  const state = Math.random().toString(36).substring(7)
  const redirectUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(APP_URL + '/api/auth/callback')}&state=${state}&scope=repo`
  return c.redirect(redirectUrl)
})

// OAuth flow - callback
app.get('/api/auth/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  
  if (!code) {
    return c.json({ error: 'No code provided' }, 400)
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    })
    
    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string }
    
    if (!tokenData.access_token) {
      return c.json({ error: tokenData.error || 'Failed to get token' }, 400)
    }
    
    // Create session
    const sessionId = Math.random().toString(36).substring(2, 15)
    sessions.set(sessionId, { token: tokenData.access_token })
    
    // Get user's installations if using GitHub App
    if (githubApp) {
      const octokit = new Octokit({ auth: tokenData.access_token })
      const { data } = await octokit.request('GET /user/installations')
      const installationIds = data.installations?.map((i: any) => i.id) || []
      sessions.get(sessionId)!.installations = installationIds
    }
    
    // Redirect back to app with session
    return c.redirect(`/?session=${sessionId}`)
  } catch (error) {
    console.error('OAuth error:', error)
    return c.json({ error: 'Authentication failed' }, 500)
  }
})

// Get current auth status
app.get('/api/auth/status', async (c) => {
  const sessionId = c.req.header('x-session-id')
  
  if (!sessionId || !sessions.has(sessionId)) {
    return c.json({ authenticated: false })
  }
  
  const session = sessions.get(sessionId)!
  const octokit = new Octokit({ auth: session.token })
  
  try {
    const { data: user } = await octokit.request('GET /user')
    return c.json({ 
      authenticated: true, 
      user: { login: user.login, avatar_url: user.avatar_url },
      installations: session.installations || []
    })
  } catch {
    sessions.delete(sessionId)
    return c.json({ authenticated: false })
  }
})

// Logout
app.post('/api/auth/logout', (c) => {
  const sessionId = c.req.header('x-session-id')
  if (sessionId) {
    sessions.delete(sessionId)
  }
  return c.json({ ok: true })
})

// Get a single run (with optional attempt)
app.get('/api/runs/:owner/:repo/:id', async (c) => {
  const { owner, repo, id } = c.req.param()
  const attempt = c.req.query('attempt')
  
  try {
    const octokit = await getOctokit(c)
    
    if (attempt) {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}', {
        owner,
        repo,
        run_id: parseInt(id),
        attempt_number: parseInt(attempt),
      })
      return c.json(data)
    } else {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', {
        owner,
        repo,
        run_id: parseInt(id),
      })
      return c.json(data)
    }
  } catch (error: any) {
    console.error('Error fetching run:', error.message)
    return c.json({ error: error.message }, error.status || 500)
  }
})

// Get jobs for a run/attempt
app.get('/api/runs/:owner/:repo/:id/jobs', async (c) => {
  const { owner, repo, id } = c.req.param()
  const attempt = c.req.query('attempt')
  
  try {
    const octokit = await getOctokit(c)
    
    if (attempt) {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs', {
        owner,
        repo,
        run_id: parseInt(id),
        attempt_number: parseInt(attempt),
        per_page: 100,
      })
      return c.json(data.jobs)
    } else {
      // Paginate through all jobs
      const jobs = await octokit.paginate('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
        owner,
        repo,
        run_id: parseInt(id),
        per_page: 100,
      })
      return c.json(jobs)
    }
  } catch (error: any) {
    console.error('Error fetching jobs:', error.message)
    return c.json({ error: error.message }, error.status || 500)
  }
})

// List recent runs on a branch
app.get('/api/branch/:owner/:repo/:branch{.+}', async (c) => {
  const { owner, repo, branch } = c.req.param()
  const limit = parseInt(c.req.query('limit') || '10')
  
  try {
    const octokit = await getOctokit(c)
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
      owner,
      repo,
      branch,
      per_page: limit,
    })
    return c.json(data.workflow_runs || [])
  } catch (error: any) {
    console.error('Error fetching branch runs:', error.message)
    return c.json({ error: error.message }, error.status || 500)
  }
})

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', async (c) => {
    const path = c.req.path === '/' ? '/index.html' : c.req.path
    const file = Bun.file(`./dist${path}`)
    if (await file.exists()) {
      return new Response(file)
    }
    // Fallback to index.html for client-side routing
    return new Response(Bun.file('./dist/index.html'))
  })
}

const port = Number(process.env.PORT || 3001)
console.log(`gh-gantt-app server on :${port}`)
console.log(`GitHub App mode: ${githubApp ? 'enabled' : 'disabled'}`)
console.log(`OAuth configured: ${GITHUB_CLIENT_ID ? 'yes' : 'no'}`)

export default { port, fetch: app.fetch }