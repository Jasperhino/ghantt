// Compare view: grouped horizontal bars per (job, step), Run A vs Run B with delta annotations.
import { useMemo } from 'react'
import type { Annotations, Data, Layout } from 'plotly.js'
import { PlotlyChart } from './PlotlyChart'
import { fmt, fmtDate, fmtSigned, runnerInstance } from '@/lib/format'
import type { JobRow, RunPayload } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'

interface JobIndex {
  job: JobRow
  steps: Map<number, JobRow['steps'][number]>
}

const indexJobs = (r: RunPayload): Map<string, JobIndex> => {
  const m = new Map<string, JobIndex>()
  for (const j of r.jobs) {
    const steps = new Map<number, JobRow['steps'][number]>()
    j.steps.forEach((s) => steps.set(s.number, s))
    m.set(j.name, { job: j, steps })
  }
  return m
}

export function GanttCompare({ runA, runB }: { runA: RunPayload; runB: RunPayload }) {
  const { traces, layout } = useMemo(() => {
    if (runA.empty || runB.empty) return { traces: [], layout: {} as Partial<Layout> }
    const idxA = indexJobs(runA)
    const idxB = indexJobs(runB)
    const seen = new Set<string>()
    const jobOrder: string[] = []
    runA.jobs.forEach((j) => { if (!seen.has(j.name)) { jobOrder.push(j.name); seen.add(j.name) } })
    runB.jobs.forEach((j) => { if (!seen.has(j.name)) { jobOrder.push(j.name); seen.add(j.name) } })

    const yCats: string[] = []
    const aDur: number[] = []
    const aBase: number[] = []
    const aHover: string[] = []
    const bDur: number[] = []
    const bBase: number[] = []
    const bHover: string[] = []
    const annotations: Partial<Annotations>[] = []

    const skipQueue = !!runA._noQueue && !!runB._noQueue

    for (const jobName of jobOrder) {
      const a = idxA.get(jobName)
      const b = idxB.get(jobName)
      if (!skipQueue) {
        const qy = `${jobName} ▸ queue`
        yCats.push(qy)
        aDur.push(a?.job.queue_s ?? 0)
        aBase.push(a?.job.rel_created ?? 0)
        const aVm = a ? runnerInstance(a.job.runner_labels, a.job.runner_name) : null
        const bVm = b ? runnerInstance(b.job.runner_labels, b.job.runner_name) : null
        aHover.push(
          a
            ? `<b>${jobName}</b><br>queue (A): ${fmt(a.job.queue_s)}<br>runner: ${(a.job.runner_labels || []).join(',')}${aVm ? `<br>instance: ${aVm}` : ''}<extra></extra>`
            : '<i>not in A</i><extra></extra>',
        )
        bDur.push(b?.job.queue_s ?? 0)
        bBase.push(b?.job.rel_created ?? 0)
        bHover.push(
          b
            ? `<b>${jobName}</b><br>queue (B): ${fmt(b.job.queue_s)}<br>runner: ${(b.job.runner_labels || []).join(',')}${bVm ? `<br>instance: ${bVm}` : ''}<extra></extra>`
            : '<i>not in B</i><extra></extra>',
        )
        if (a && b) {
          const d = (b.job.queue_s ?? 0) - (a.job.queue_s ?? 0)
          if (Math.abs(d) >= 5) {
            annotations.push({
              x: 1, xref: 'paper', xanchor: 'left',
              y: qy, yref: 'y',
              text: ' Δq ' + fmtSigned(d),
              showarrow: false,
              font: { size: 10, color: d > 0 ? '#fb923c' : '#34d399' },
            } as Partial<Annotations>)
          }
        }
      }

      const stepNums = new Set<number>([
        ...(a ? [...a.steps.keys()] : []),
        ...(b ? [...b.steps.keys()] : []),
      ])
      const sorted = [...stepNums].sort((x, y) => x - y)
      for (const num of sorted) {
        const sa = a?.steps.get(num)
        const sb = b?.steps.get(num)
        const stepName = sa?.name || sb?.name || `step ${num}`
        const cat = `${jobName} ▸ ${num}. ${stepName.length > 40 ? stepName.slice(0, 37) + '…' : stepName}`
        yCats.push(cat)
        aDur.push(sa?.dur ?? 0)
        aBase.push(sa?.rel_start ?? 0)
        aHover.push(
          sa
            ? `<b>${jobName}</b><br>step ${num}: ${stepName}<br>A: ${fmt(sa.dur)} · t+${fmt(sa.rel_start)}<extra></extra>`
            : '<i>not in A</i><extra></extra>',
        )
        bDur.push(sb?.dur ?? 0)
        bBase.push(sb?.rel_start ?? 0)
        bHover.push(
          sb
            ? `<b>${jobName}</b><br>step ${num}: ${stepName}<br>B: ${fmt(sb.dur)} · t+${fmt(sb.rel_start)}<extra></extra>`
            : '<i>not in B</i><extra></extra>',
        )
        if (sa && sb) {
          const d = sb.dur - sa.dur
          if (Math.abs(d) >= 3) {
            annotations.push({
              x: 1, xref: 'paper', xanchor: 'left',
              y: cat, yref: 'y',
              text: ' Δ ' + fmtSigned(d),
              showarrow: false,
              font: { size: 10, color: d > 0 ? '#fb923c' : '#34d399' },
            } as Partial<Annotations>)
          }
        }
      }
    }

    const tickMax = Math.max(runA.total_wall, runB.total_wall)
    const tickStep = tickMax > 3600 ? 600 : tickMax > 1200 ? 120 : tickMax > 300 ? 60 : 30
    const tickvals: number[] = []
    const ticktext: string[] = []
    for (let t = 0; t <= tickMax + 1; t += tickStep) { tickvals.push(t); ticktext.push(fmt(t)) }

    const traces: Data[] = [
      {
        name: `A · #${runA.run_id}${runA.attempt ? `/a${runA.attempt}` : ''}`,
        x: aDur, base: aBase, y: yCats,
        orientation: 'h', type: 'bar',
        marker: { color: '#60a5fa' },
        hovertemplate: aHover,
        offsetgroup: 'A',
      } as Data,
      {
        name: `B · #${runB.run_id}${runB.attempt ? `/a${runB.attempt}` : ''}`,
        x: bDur, base: bBase, y: yCats,
        orientation: 'h', type: 'bar',
        marker: { color: '#fb923c' },
        hovertemplate: bHover,
        offsetgroup: 'B',
      } as Data,
    ]

    const layout: Partial<Layout> = {
      barmode: 'group',
      bargap: 0.2,
      bargroupgap: 0.05,
      height: Math.max(500, 18 * yCats.length + 120),
      margin: { l: 380, r: 120, t: 10, b: 50 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#e5e7eb', size: 10 },
      xaxis: {
        title: { text: 'seconds from run_started_at (per run)' },
        tickvals, ticktext, gridcolor: '#1f242b',
      },
      yaxis: { automargin: true, autorange: 'reversed', gridcolor: '#1f242b', tickfont: { size: 10 } },
      showlegend: true,
      legend: { orientation: 'h', y: 1.02, x: 0 },
      annotations,
    }
    return { traces, layout }
  }, [runA, runB])

  if (runA.empty || runB.empty) {
    return <p className="text-sm text-muted-foreground">One of the runs has no jobs — cannot compare.</p>
  }

  const dWall = runB.total_wall - runA.total_wall
  const aQ = runA.jobs.reduce((a, j) => a + (j.queue_s || 0), 0)
  const bQ = runB.jobs.reduce((a, j) => a + (j.queue_s || 0), 0)
  const aE = runA.jobs.reduce((a, j) => a + (j.exec_s || 0), 0)
  const bE = runB.jobs.reduce((a, j) => a + (j.exec_s || 0), 0)

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground space-x-4">
        <span>
          <b>A:</b>{' '}
          <a className="text-primary hover:underline" href={runA.run_url} target="_blank" rel="noreferrer">
            #{runA.run_id}{runA.attempt ? `/a${runA.attempt}` : ''}
          </a>{' '}· <code className="font-mono">{runA.head_sha}</code> · {fmtDate(runA.run_start)}
        </span>
        <span>
          <b>B:</b>{' '}
          <a className="text-primary hover:underline" href={runB.run_url} target="_blank" rel="noreferrer">
            #{runB.run_id}{runB.attempt ? `/a${runB.attempt}` : ''}
          </a>{' '}· <code className="font-mono">{runB.head_sha}</code> · {fmtDate(runB.run_start)}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KPI label="wall A → B" value={`${fmt(runA.total_wall)} → ${fmt(runB.total_wall)}`} sub={`Δ ${fmtSigned(dWall)}`} />
        <KPI label="Σ queue A → B" value={`${fmt(aQ)} → ${fmt(bQ)}`} sub={`Δ ${fmtSigned(bQ - aQ)}`} />
        <KPI label="Σ exec A → B" value={`${fmt(aE)} → ${fmt(bE)}`} sub={`Δ ${fmtSigned(bE - aE)}`} />
        <KPI label="jobs (A / B)" value={`${runA.jobs.length} / ${runB.jobs.length}`} />
        <KPI label="crit job A / B" value={runA.crit_end_job} sub={runB.crit_end_job} />
      </div>

      <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
        <Sw color="#60a5fa" label="Run A" />
        <Sw color="#fb923c" label="Run B" />
        <Sw color="#6b7280" label="queue" />
        <span>Δ &gt; 0 = B slower than A</span>
      </div>

      <PlotlyChart data={traces} layout={layout} style={{ width: '100%' }} />
    </div>
  )
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-base font-semibold mt-1 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
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
