// Single-run Gantt: one row per job, queue bar + per-step bars.
import { useMemo } from 'react'
import type { Data, Layout, Shape } from 'plotly.js'
import { PlotlyChart } from './PlotlyChart'
import { fmt, fmtDate, fmtSigned, runnerColor, runnerInstance, shortRunner, stepColor } from '@/lib/format'
import type { RunPayload } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const concBadgeVariant = (c: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (c === 'success') return 'default'
  if (c === 'failure') return 'destructive'
  return 'secondary'
}

export function GanttSingle({ run }: { run: RunPayload }) {
  const { traces, layout, runnerLegend } = useMemo(() => {
    if (run.empty) return { traces: [], layout: {}, runnerLegend: [] }
    const jobs = run.jobs
    const runnerTags = jobs.map((j) => shortRunner(j.runner_labels, j.runner_name))
    const runnerVMs = jobs.map((j) => runnerInstance(j.runner_labels, j.runner_name))
    const yLabels = jobs.map((j, i) => {
      const base = j.name.length > 50 ? j.name.slice(0, 47) + '…' : j.name
      const col = runnerColor(runnerTags[i])
      const vm = runnerVMs[i]
      const tag = vm ? `[${runnerTags[i]} · ${vm}]` : `[${runnerTags[i]}]`
      return `${base}  <span style="color:${col}; font-family:monospace; font-size:10px">${tag}</span>`
    })
    const traces: Data[] = []
    const shapes: Partial<Shape>[] = []

    jobs.forEach((j, i) => {
      const y = yLabels[i]
      if (j.rel_created != null && j.rel_started != null && j.rel_started > j.rel_created) {
        traces.push({
          x: [j.rel_started - j.rel_created],
          base: [j.rel_created],
          y: [y],
          orientation: 'h',
          type: 'bar',
          marker: { color: '#6b7280', opacity: 0.4, line: { width: 0 } },
          hovertemplate: `<b>${j.name}</b><br>queue: ${fmt(j.queue_s)}<br>runner: ${(
            j.runner_labels || []
          ).join(', ') || j.runner_name || '—'}${
            runnerVMs[i] ? `<br>instance: ${runnerVMs[i]}` : ''
          }<extra></extra>`,
          showlegend: false,
        } as Data)
      }
      for (const s of j.steps) {
        traces.push({
          x: [s.rel_end - s.rel_start],
          base: [s.rel_start],
          y: [y],
          orientation: 'h',
          type: 'bar',
          marker: { color: stepColor(s.name, s.conclusion), opacity: 0.92, line: { width: 0 } },
          hovertemplate: `<b>${j.name}</b><br>step ${s.number}: ${s.name}<br>${fmt(s.dur)} · t+${fmt(
            s.rel_start,
          )} → t+${fmt(s.rel_end)}<extra></extra>`,
          showlegend: false,
        } as Data)
      }
      if (j.critical && j.rel_created != null && j.rel_completed != null) {
        shapes.push({
          type: 'rect',
          x0: j.rel_created,
          x1: j.rel_completed,
          y0: i - 0.45,
          y1: i + 0.45,
          line: { color: '#a78bfa', width: 2 },
          fillcolor: 'rgba(0,0,0,0)',
          yref: 'y',
          xref: 'x',
        } as Partial<Shape>)
      }
    })

    const tickStep =
      run.total_wall > 3600 ? 600 : run.total_wall > 1200 ? 120 : run.total_wall > 300 ? 60 : 30
    const tickvals: number[] = []
    const ticktext: string[] = []
    for (let t = 0; t <= run.total_wall + 1; t += tickStep) {
      tickvals.push(t)
      ticktext.push(fmt(t))
    }

    const layout: Partial<Layout> = {
      barmode: 'stack',
      height: Math.max(400, 22 * jobs.length + 100),
      margin: { l: 320, r: 30, t: 10, b: 50 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#e5e7eb', size: 11 },
      xaxis: {
        title: { text: 'seconds from run_started_at' },
        tickvals,
        ticktext,
        gridcolor: '#1f242b',
        showspikes: true,
        spikecolor: '#60a5fa',
        spikethickness: 1,
      },
      yaxis: { automargin: true, autorange: 'reversed', gridcolor: '#1f242b' },
      shapes,
      hovermode: 'closest',
    }

    const counts: Record<string, { count: number; vm: string | null }> = {}
    runnerTags.forEach((t, i) => {
      counts[t] = counts[t] || { count: 0, vm: runnerVMs[i] }
      counts[t].count += 1
    })
    const runnerLegend = Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([t, v]) => ({ tag: t, color: runnerColor(t), count: v.count, vm: v.vm }))

    return { traces, layout, runnerLegend }
  }, [run])

  if (run.empty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            #{run.run_id}
            {run.attempt ? `/a${run.attempt}` : ''}
          </CardTitle>
          <CardDescription>No jobs returned by API for this run.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const jobs = run.jobs
  const totQ = jobs.reduce((a, j) => a + (j.queue_s || 0), 0)
  const totE = jobs.reduce((a, j) => a + (j.exec_s || 0), 0)
  const maxQ = Math.max(0, ...jobs.map((j) => j.queue_s || 0))
  const maxE = Math.max(0, ...jobs.map((j) => j.exec_s || 0))
  const qs = jobs
    .map((j) => j.queue_s)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)
  const medQ = qs.length ? qs[Math.floor(qs.length / 2)] : null
  const critJob = jobs.find((j) => j.critical)
  const wallSubLabel = run._noQueue
    ? `theoretical · actual ${fmt(run.total_wall_actual!)} (Δ ${fmtSigned(run.total_wall - (run.total_wall_actual ?? 0))})`
    : 'run_started → last completed'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
        <a className="text-primary hover:underline" href={run.run_url} target="_blank" rel="noreferrer">
          #{run.run_id}{run.attempt ? `/a${run.attempt}` : ''}
        </a>
        <Badge variant={concBadgeVariant(run.conclusion || run.status)}>
          {run.conclusion || run.status || '—'}
        </Badge>
        <span>workflow: <b className="text-foreground">{run.workflow_name || '—'}</b></span>
        <span>· branch: <code className="font-mono text-xs">{run.head_branch}</code></span>
        <span>· sha: <code className="font-mono text-xs">{run.head_sha}</code></span>
        <span>· event: {run.event}</span>
        <span>· attempt: {run.run_attempt}</span>
        <span>· {fmtDate(run.run_start)} → {fmtDate(run.run_end)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KPI label={`total wall${run._noQueue ? ' (no queue)' : ''}`} value={fmt(run.total_wall)} sub={wallSubLabel} highlight={run._noQueue} />
        <KPI label="jobs" value={jobs.length.toString()} sub={`${jobs.filter((j) => j.conclusion === 'success').length} ok · ${jobs.filter((j) => j.conclusion === 'failure').length} fail`} />
        <KPI label="queue: median / max" value={`${fmt(medQ)} / ${fmt(maxQ)}`} sub={`Σ ${fmt(totQ)}`} />
        <KPI label="exec: max" value={fmt(maxE)} sub={`Σ ${fmt(totE)} compute-seconds`} />
        <KPI label={`critical: ${run.crit_end_job}`} value={`exec ${fmt(critJob?.exec_s)}`} sub={`queue ${fmt(critJob?.queue_s)}`} />
      </div>

      <Legend />
      <div className="text-xs text-muted-foreground flex flex-wrap gap-3 items-center">
        <span>runners:</span>
        {runnerLegend.map(({ tag, color, count, vm }) => (
          <span key={tag} className="inline-flex items-center gap-1">
            <span style={{ background: color }} className="w-3 h-2.5 rounded-sm inline-block" />
            <code className="font-mono text-xs">{tag}</code>
            {vm && <span className="text-muted-foreground/70 text-[10px]">({vm})</span>}
            <span>×{count}</span>
          </span>
        ))}
      </div>

      <PlotlyChart data={traces} layout={layout} style={{ width: '100%' }} />
    </div>
  )
}

function KPI({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary/50' : ''}>
      <CardContent className="px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function Legend() {
  return (
    <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
      <Sw color="#6b7280" label="queue" />
      <Sw color="#3b82f6" label="setup / checkout" />
      <Sw color="#10b981" label="main work (success)" />
      <Sw color="#ef4444" label="main work (fail)" />
      <Sw color="#f59e0b" label="upload / post" />
      <Sw color="#a78bfa" label="critical-path job" />
    </div>
  )
}

function Sw({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span style={{ background: color }} className="w-3 h-2.5 rounded-sm inline-block" />
      {label}
    </span>
  )
}
