// Tiny Bun + Hono server that proxies gh CLI calls.
// Frontend calls /api/* during dev (Vite proxies 3000 -> 3001).
// In prod build, serves dist/ statically too.
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { spawn } from 'node:child_process'

const app = new Hono()
app.use('*', cors())

function ghApi(endpoint: string, paginate = false): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = ['api']
    if (paginate) args.push('--paginate', '--slurp')
    args.push(endpoint)
    const child = spawn('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (b) => (out += b.toString()))
    child.stderr.on('data', (b) => (err += b.toString()))
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`gh exit ${code}: ${err}`))
      try {
        resolve(JSON.parse(out))
      } catch (e) {
        reject(new Error(`bad JSON from gh: ${(e as Error).message}\n${out.slice(0, 200)}`))
      }
    })
    child.on('error', (e) => reject(e))
  })
}

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))

// Get a single run (with optional attempt)
// /api/runs/:owner/:repo/:id?attempt=2
app.get('/api/runs/:owner/:repo/:id', async (c) => {
  const { owner, repo, id } = c.req.param()
  const attempt = c.req.query('attempt')
  const ep = attempt
    ? `/repos/${owner}/${repo}/actions/runs/${id}/attempts/${attempt}`
    : `/repos/${owner}/${repo}/actions/runs/${id}`
  try {
    const data = await ghApi(ep)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }
})

// Get jobs for a run/attempt
app.get('/api/runs/:owner/:repo/:id/jobs', async (c) => {
  const { owner, repo, id } = c.req.param()
  const attempt = c.req.query('attempt')
  const ep = attempt
    ? `/repos/${owner}/${repo}/actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`
    : `/repos/${owner}/${repo}/actions/runs/${id}/jobs?per_page=100`
  try {
    const data = await ghApi(ep, true)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }
})

// List recent runs on a branch
// /api/branch/:owner/:repo/:branch?limit=10
app.get('/api/branch/:owner/:repo/:branch{.+}', async (c) => {
  const { owner, repo, branch } = c.req.param()
  const limit = c.req.query('limit') || '10'
  const ep = `/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=${limit}`
  try {
    const data = (await ghApi(ep)) as { workflow_runs?: unknown[] }
    return c.json(data.workflow_runs || [])
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }
})

const port = Number(process.env.PORT || 3001)
console.log(`gh-gantt-app server on :${port}`)
export default { port, fetch: app.fetch }
