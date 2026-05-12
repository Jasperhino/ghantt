# ghantt

GitHub Actions Gantt chart visualizer - Per-step timeline and queue analysis for workflow runs

Live React + TS app for GitHub Actions per-step Gantt + queue/compare analysis.

## Features

- 📊 **Per-step Gantt charts**: Visualize your GitHub Actions workflow runs with detailed step-level timing
- ⏱️ **Queue time analysis**: See how much time jobs spend waiting vs executing
- 🔄 **Matrix job grouping**: Automatically groups and collapses matrix jobs for cleaner visualization
- 📈 **Compare runs**: Side-by-side comparison of two workflow runs with delta annotations
- 🏃 **Runner analysis**: See which runners were used and their performance characteristics
- 🔒 **Private repo support**: Works with private repositories via GitHub OAuth
- 🎯 **No-queue mode**: Theoretical wall time if all jobs started immediately

## Quick Start

### Option 1: Use Local `gh` CLI (Original Version)

If you want to use the simpler version that relies on your local GitHub CLI:

```bash
git checkout main
bun install
bun run dev
```

This version uses your existing `gh` CLI authentication.

### Option 2: Deploy as GitHub App (This Branch)

This branch (`github-app`) supports OAuth authentication and can be deployed to the cloud.

#### Local Development

1. Create a GitHub OAuth App:
   - Go to https://github.com/settings/applications/new
   - Application name: `ghantt-dev`
   - Homepage URL: `http://localhost:3001`
   - Callback URL: `http://localhost:3001/api/auth/callback`

2. Create `.env` file:
```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
APP_URL=http://localhost:3001
```

3. Run the app:
```bash
bun install
bun run dev
```

4. Open http://localhost:3000 and click "Sign in with GitHub"

#### Production Deployment

See [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) for detailed deployment instructions including:
- Full GitHub App setup (for better rate limits)
- Deployment to Vercel, Railway, Fly.io, or Docker
- Environment configuration

## Usage

### Loading Runs

1. **Specific run**: Paste a GitHub Actions run URL like:
   ```
   https://github.com/owner/repo/actions/runs/123456789
   ```

2. **Branch runs**: Enter owner/repo and branch name to see recent runs in a table

### Analyzing Performance

- **Gray bars**: Queue time (waiting for runner)
- **Colored bars**: Execution time (actual work)
- **Runner tags**: Shows runner type and instance
- **Matrix groups**: Click to expand/collapse grouped jobs
- **Compare mode**: See performance differences between runs

### UI Controls

- **Single/Compare tabs**: Switch between viewing modes
- **No-queue toggle**: Show theoretical timeline without queue delays
- **Run selector**: Pick from loaded runs via dropdown

## Tech Stack

**Frontend**: 
- Vite + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Plotly.js for interactive charts

**Backend**: 
- Bun + Hono server
- Octokit for GitHub API
- OAuth 2.0 authentication

## Project Structure

```
server/index.ts        — Hono server with OAuth + GitHub API
src/
  lib/
    auth.tsx           — Auth context and session management
    api.ts             — Frontend API client
    transform.ts       — GH jobs/steps → RunPayload, applyNoQueue()
    format.ts          — Formatting utilities and parsers
    types.ts           — TypeScript types
  components/
    GanttSingle.tsx    — Single-run Gantt chart (Plotly)
    GanttCompare.tsx   — Compare view with delta annotations
    PlotlyChart.tsx    — Plotly wrapper with event handlers
    ui/                — shadcn/ui components
  App.tsx              — Main app with URL/branch input, mode switcher
```

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT