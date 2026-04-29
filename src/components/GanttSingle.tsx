// Single-run Gantt: one row per job (or collapsed matrix group), queue + step bars,
// status icon prefix, optional `needs:` arrows inferred from timing.
import { useMemo, useState } from 'react'
import type { Data, Layout, Shape } from 'plotly.js'
import { PlotlyChart } from './PlotlyChart'
import {
  aggregateStatus, fmt, fmtDate, fmtSigned, runnerColor, runnerInstance,
  shortRunner, statusIcon, stepColor,
} from '@/lib/format'
import type { JobRow, RunPayload } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const concBadgeVariant = (c: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (c === 'success') return 'default'
  if (c === 'failure') return 'destructive'
  return 'secondary'
}

interface GroupRow {
  kind: 'group'
  groupKey: string
  members: JobRow[]
}
interface JobDisplayRow {
  kind: 'job'
  job: JobRow
}
type DisplayRow = GroupRow | JobDisplayRow

const truncateName = (s: string) => (s.length > 50 ? s.slice(0, 47) + '…' : s)

const wrapIcon = (s: ReturnType<typeof statusIcon>) =>
  `<span style="color:${s.color}; font-family:monospace">${s.icon}</span>`

export function GanttSingle({ run }: { run: RunPayload }) {
  // Detect matrix groups (>= 2 members sharing a base name + matrix_index suffix).
  const groups = useMemo(() => {
    const m = new Map<string, JobRow[]>()
    for (const j of run.jobs) {
      if (!j.matrix_index) continue
      const arr = m.get(j.group_key) || []
      arr.push(j)
      m.set(j.group_key, arr)
    }
    return [...m.entries()]
      .filter(([, members]) => members.length >= 2)
      .map(([groupKey, members]) => ({ groupKey, members }))
  }, [run])

  // Default: every detected matrix group is collapsed. Toggle stores expanded ones.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showNeeds, setShowNeeds] = useState(false)

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const expandAll = () => setExpanded(new Set(groups.map((g) => g.groupKey)))
  const collapseAll = () => setExpanded(new Set())

  const { traces, layout, runnerLegend } = useMemo(() => {
    if (run.empty) {
      return { traces: [] as Data[], layout: {} as Partial<Layout>, runnerLegend: [] as Array<{ tag: string; color: string; count: number; vm: string | null }> }
    }
    const groupedKeys = new Set(groups.map((g) => g.groupKey))

    // Build display rows in chronological order.
    // - Non-matrix jobs: emitted in their natural order.
    // - Matrix groups: emitted at the position of their first member; expanded
    //   groups also emit each member afterwards.
    const rows: DisplayRow[] = []
    const seenGroup = new Set<string>()
    for (const j of run.jobs) {
      const inGroup = j.matrix_index && groupedKeys.has(j.group_key)
      if (!inGroup) {
        rows.push({ kind: 'job', job: j })
        continue
      }
      if (!seenGroup.has(j.group_key)) {
        const members = groups.find((g) => g.groupKey === j.group_key)!.members
        rows.push({ kind: 'group', groupKey: j.group_key, members })
        seenGroup.add(j.group_key)
        if (expanded.has(j.group_key)) {
          for (const m of members) rows.push({ kind: 'job', job: m })
        }
      } else if (expanded.has(j.group_key)) {
        // Already emitted the group header earlier — its members were emitted
        // right after, so skip duplicates here.
      }
    }

    // Map each underlying job id to the row that visually represents it.
    // (Used to anchor `needs:` arrows even when a predecessor is hidden inside
    // a collapsed group.)
    const rowKey = (r: DisplayRow): string =>
      r.kind === 'group' ? `g:${r.groupKey}` : `j:${r.job.id}`
    const yLabelFor = (r: DisplayRow): string => {
      if (r.kind === 'group') {
        const status = aggregateStatus(r.members)
        const tag = shortRunner(r.members[0].runner_labels, r.members[0].runner_name)
        const vm = runnerInstance(r.members[0].runner_labels, r.members[0].runner_name)
        const col = runnerColor(tag)
        const expandedFlag = expanded.has(r.groupKey)
        const chevron = expandedFlag ? '▾' : '▸'
        const tagText = vm ? `[${tag} · ${vm}]` : `[${tag}]`
        return `${wrapIcon(status)} ${chevron} ${truncateName(r.groupKey)} ×${r.members.length}  <span style="color:${col}; font-family:monospace; font-size:10px">${tagText}</span>`
      }
      const j = r.job
      const tag = shortRunner(j.runner_labels, j.runner_name)
      const vm = runnerInstance(j.runner_labels, j.runner_name)
      const col = runnerColor(tag)
      const tagText = vm ? `[${tag} · ${vm}]` : `[${tag}]`
      const status = statusIcon(j.conclusion, j.status)
      const indent = j.matrix_index ? '   ' : '' // visually nest matrix members
      const baseName = j.matrix_index ? `[${j.matrix_index}]` : j.name
      return `${wrapIcon(status)} ${indent}${truncateName(baseName)}  <span style="color:${col}; font-family:monospace; font-size:10px">${tagText}</span>`
    }

    const yLabels = rows.map((r) => yLabelFor(r))
    const rowKeyByJobId = new Map<number, string>()
    rows.forEach((r) => {
      if (r.kind === 'job') rowKeyByJobId.set(r.job.id, rowKey(r))
      else for (const m of r.members) rowKeyByJobId.set(m.id, rowKey(r))
    })
    const yByRowKey = new Map<string, string>()
    rows.forEach((r, i) => yByRowKey.set(rowKey(r), yLabels[i]))

    const traces: Data[] = []
    const shapes: Partial<Shape>[] = []

    rows.forEach((r, i) => {
      const y = yLabels[i]
      if (r.kind === 'group') {
        // Aggregate bar: queue from earliest created to earliest started, exec
        // from earliest started to latest completed. No per-step detail.
        const created = Math.min(...r.members.map((m) => m.rel_created ?? Infinity))
        const started = Math.min(...r.members.map((m) => m.rel_started ?? created))
        const completed = Math.max(...r.members.map((m) => m.rel_completed ?? started))
        const status = aggregateStatus(r.members)
        const tag = shortRunner(r.members[0].runner_labels, r.members[0].runner_name)
        const vm = runnerInstance(r.members[0].runner_labels, r.members[0].runner_name)
        const okN = r.members.filter((m) => m.conclusion === 'success').length
        const failN = r.members.filter((m) => m.conclusion === 'failure').length
        const runN = r.members.filter((m) => m.status === 'in_progress').length
        if (started > created) {
          traces.push({
            x: [started - created],
            base: [created],
            y: [y],
            orientation: 'h', type: 'bar',
            marker: { color: '#6b7280', opacity: 0.4, line: { width: 0 } },
            hovertemplate: `<b>${r.groupKey}</b> ×${r.members.length}<br>queue (group): ${fmt(started - created)}<extra></extra>`,
            showlegend: false,
          } as Data)
        }
        const aggColor =
          status.label === 'failure' || status.label === 'timed out' ? '#ef4444'
          : status.label === 'running' ? '#60a5fa'
          : status.label === 'cancelled' ? '#9ca3af'
          : '#10b981'
        traces.push({
          x: [completed - started],
          base: [started],
          y: [y],
          orientation: 'h', type: 'bar',
          marker: { color: aggColor, opacity: 0.85, line: { width: 0 } },
          hovertemplate: `<b>${r.groupKey}</b> ×${r.members.length}<br>${okN} ok · ${failN} fail · ${runN} running<br>span: ${fmt(completed - started)}<br>runner: ${tag}${vm ? ` (${vm})` : ''}<br><i>click pill above to expand</i><extra></extra>`,
          showlegend: false,
        } as Data)
        return
      }

      const j = r.job
      if (j.rel_created != null && j.rel_started != null && j.rel_started > j.rel_created) {
        traces.push({
          x: [j.rel_started - j.rel_created],
          base: [j.rel_created],
          y: [y],
          orientation: 'h', type: 'bar',
          marker: { color: '#6b7280', opacity: 0.4, line: { width: 0 } },
          hovertemplate: `<b>${j.name}</b><br>queue: ${fmt(j.queue_s)}<br>runner: ${(j.runner_labels || []).join(', ') || j.runner_name || '—'}${
            runnerInstance(j.runner_labels, j.runner_name) ? `<br>instance: ${runnerInstance(j.runner_labels, j.runner_name)}` : ''
          }${
            j.predecessors.length
              ? `<br>needs: ${j.predecessors.map((id) => run.jobs.find((x) => x.id === id)?.name || id).join(', ')}`
              : ''
          }<extra></extra>`,
          showlegend: false,
        } as Data)
      }
      for (const s of j.steps) {
        traces.push({
          x: [s.rel_end - s.rel_start],
          base: [s.rel_start],
          y: [y],
          orientation: 'h', type: 'bar',
          marker: { color: stepColor(s.name, s.conclusion), opacity: 0.92, line: { width: 0 } },
          hovertemplate: `<b>${j.name}</b><br>step ${s.number}: ${s.name}<br>${fmt(s.dur)} · t+${fmt(s.rel_start)} → t+${fmt(s.rel_end)}<extra></extra>`,
          showlegend: false,
        } as Data)
      }
      if (j.critical && j.rel_created != null && j.rel_completed != null) {
        shapes.push({
          type: 'rect',
          x0: j.rel_created, x1: j.rel_completed,
          y0: i - 0.45, y1: i + 0.45,
          line: { color: '#a78bfa', width: 2 },
          fillcolor: 'rgba(0,0,0,0)',
          yref: 'y', xref: 'x',
        } as Partial<Shape>)
      }
    })

    // Optional `needs:` arrows. Anchor at upstream's actual rel_completed and
    // downstream's rel_started, mapped through the row-key lookup so collapsed
    // groups still resolve.
    if (showNeeds) {
      for (const r of rows) {
        if (r.kind !== 'job') continue
        const j = r.job
        if (j.rel_started == null) continue
        const myKey = rowKey(r)
        const myY = yByRowKey.get(myKey)
        if (!myY) continue
        for (const predId of j.predecessors) {
          const predRowKey = rowKeyByJobId.get(predId)
          if (!predRowKey || predRowKey === myKey) continue
          const predY = yByRowKey.get(predRowKey)
          if (!predY) continue
          const pred = run.jobs.find((x) => x.id === predId)
          if (!pred || pred.rel_completed == null) continue
          shapes.push({
            type: 'line',
            x0: pred.rel_completed, x1: j.rel_started,
            y0: predY, y1: myY,
            xref: 'x', yref: 'y',
            line: { color: 'rgba(167,139,250,0.55)', width: 1, dash: 'dot' },
          } as Partial<Shape>)
        }
      }
    }

    const tickStep =
      run.total_wall > 3600 ? 600 : run.total_wall > 1200 ? 120 : run.total_wall > 300 ? 60 : 30
    const tickvals: number[] = []
    const ticktext: string[] = []
    for (let t = 0; t <= run.total_wall + 1; t += tickStep) {
      tickvals.push(t); ticktext.push(fmt(t))
    }

    const layout: Partial<Layout> = {
      barmode: 'stack',
      height: Math.max(400, 22 * rows.length + 100),
      margin: { l: 360, r: 30, t: 10, b: 50 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#e5e7eb', size: 11 },
      xaxis: {
        title: { text: 'seconds from run_started_at' },
        tickvals, ticktext,
        gridcolor: '#1f242b',
        showspikes: true,
        spikecolor: '#60a5fa',
        spikethickness: 1,
      },
      yaxis: { automargin: true, autorange: 'reversed', gridcolor: '#1f242b' },
      shapes,
      hovermode: 'closest',
    }

    // Runner legend: count over actual jobs (not display rows) so collapse
    // doesn't change the totals.
    const counts: Record<string, { count: number; vm: string | null; color: string }> = {}
    for (const j of run.jobs) {
      const tag = shortRunner(j.runner_labels, j.runner_name)
      counts[tag] = counts[tag] || { count: 0, vm: runnerInstance(j.runner_labels, j.runner_name), color: runnerColor(tag) }
      counts[tag].count += 1
    }
    const runnerLegend = Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([tag, v]) => ({ tag, color: v.color, count: v.count, vm: v.vm }))

    return { traces, layout, runnerLegend }
  }, [run, expanded, showNeeds, groups])

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
  const qs = jobs.map((j) => j.queue_s).filter((v): v is number => v != null).sort((a, b) => a - b)
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

      {groups.length > 0 && (
        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
          <span>matrix:</span>
          {groups.map(({ groupKey, members }) => {
            const isOpen = expanded.has(groupKey)
            const status = aggregateStatus(members)
            return (
              <button
                key={groupKey}
                onClick={() => toggleGroup(groupKey)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:bg-muted/40 transition-colors"
                title={`${members.length} shards`}
              >
                <span style={{ color: status.color }}>{status.icon}</span>
                <span>{isOpen ? '▾' : '▸'}</span>
                <code className="font-mono text-[11px]">{groupKey}</code>
                <span className="text-muted-foreground">×{members.length}</span>
              </button>
            )
          })}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={expandAll}>expand all</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={collapseAll}>collapse all</Button>
        </div>
      )}

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
        <span className="ml-auto inline-flex items-center gap-2">
          <Switch id="needs" checked={showNeeds} onCheckedChange={setShowNeeds} />
          <Label htmlFor="needs" className="text-xs cursor-pointer">
            Show <code className="font-mono">needs:</code> (inferred)
          </Label>
        </span>
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
      <Sw color="#10b981" label="✓ success" />
      <Sw color="#ef4444" label="✗ failure" />
      <Sw color="#60a5fa" label="◐ running" />
      <Sw color="#9ca3af" label="⊘ cancelled" />
      <Sw color="#6b7280" label="queue" />
      <Sw color="#3b82f6" label="setup / checkout" />
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
