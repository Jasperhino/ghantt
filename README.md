# gh-gantt-app

Live React + TS app for GitHub Actions per-step Gantt + queue/compare analysis.

Frontend: Vite + React 19 + Tailwind v4 + shadcn/ui + Plotly.
Backend: Bun + Hono. Shells out to `gh` CLI (auth uses your local `gh auth`).

## Run

```bash
bun install
bun run dev      # web on :5173 (or next free), api on :5174
```

Open whatever Vite prints (default http://localhost:5173/).

## What it does

- **Single run**: paste a GH Actions run URL → renders per-step Gantt, queue bars, runner labels, KPIs (wall, queue median/max, exec, critical-path job).
- **Branch view**: load last N runs from any branch → table picker → click `view`/`A`/`B` per row.
- **Compare A vs B**: grouped horizontal bars per `(job, step)`. Step-level Δ annotations on the right margin (orange = B slower, green = B faster).
- **No-queue toggle**: shifts every job to start at `created_at`, recomputes theoretical wall clock.

## Structure

```
server/index.ts        — Hono server, proxies gh CLI
src/
  lib/
    api.ts             — frontend API client
    transform.ts       — GH jobs/steps → RunPayload, applyNoQueue()
    format.ts          — fmt/fmtDate/runner color/parse run URL
    types.ts           — TS types (GH API shapes + payload)
  components/
    GanttSingle.tsx    — single-run Gantt (Plotly)
    GanttCompare.tsx   — compare (grouped bars + Δ annotations)
    PlotlyChart.tsx    — Plotly wrapper
    ui/                — shadcn primitives
  App.tsx              — top-level: URL/branch input, picker, mode tabs, no-queue switch
```

## Auth

The Bun server shells out to `gh api`. It uses whatever auth `gh auth status` shows.
