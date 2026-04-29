// Transform raw GH API jobs+run metadata into a RunPayload consumable by Gantt views.
import type { GHJob, GHRunMeta, JobRow, RunPayload } from './types'

const parse = (s: string | null): number | null => {
  if (!s) return null
  return new Date(s).getTime()
}

// Window (seconds) for inferring predecessors from timing: a job whose
// completed_at lands in [created - WINDOW, created + GRACE] of a downstream job
// is treated as a `needs:` candidate.
const PRED_WINDOW_S = 90
const PRED_GRACE_S = 5

// Pull the "[i/N]" suffix off a job name, if any. Used to detect matrix shards.
// Match GH's "Run E2E Tests [6/12]" or "tests / shard [3/8]".
const MATRIX_RE = /\s*\[(\d+)\/(\d+)\]\s*$/
export const splitMatrix = (name: string): { groupKey: string; matrixIndex: string | null } => {
  const m = name.match(MATRIX_RE)
  if (!m) return { groupKey: name, matrixIndex: null }
  return { groupKey: name.replace(MATRIX_RE, '').trim(), matrixIndex: `${m[1]}/${m[2]}` }
}

// Infer predecessor ids per job using rel_created vs rel_completed timing.
// Sibling-fanout guard: jobs created at the same wave (within 2s) are not
// upstream of each other.
function inferPredecessorMap(rows: JobRow[]): Map<number, number[]> {
  const out = new Map<number, number[]>()
  for (const j of rows) {
    const created = j.rel_created
    if (created == null) {
      out.set(j.id, [])
      continue
    }
    const preds: number[] = []
    for (const k of rows) {
      if (k.id === j.id) continue
      const end = k.rel_completed
      if (end == null) continue
      if (Math.abs((k.rel_created ?? 0) - created) <= 2) continue
      if (end <= created + PRED_GRACE_S && end >= created - PRED_WINDOW_S) {
        preds.push(k.id)
      }
    }
    out.set(j.id, preds)
  }
  return out
}

export function buildPayload(
  ownerRepo: string,
  runId: string,
  attempt: string,
  runMeta: GHRunMeta,
  jobs: GHJob[],
): RunPayload {
  const attemptPart = attempt ? `/attempts/${attempt}` : ''
  const runUrl = `https://github.com/${ownerRepo}/actions/runs/${runId}${attemptPart}`
  const baseMeta = {
    owner_repo: ownerRepo,
    run_id: runId,
    attempt,
    run_url: runUrl,
    workflow_name: runMeta?.name || runMeta?.display_title || '',
    head_branch: runMeta?.head_branch || '',
    head_sha: (runMeta?.head_sha || '').slice(0, 7),
    event: runMeta?.event || '',
    conclusion: runMeta?.conclusion ?? null,
    status: runMeta?.status || '',
    run_attempt: runMeta?.run_attempt || 1,
    created_at: runMeta?.created_at || '',
  }

  if (!jobs.length) {
    return {
      ...baseMeta,
      run_start: runMeta?.run_started_at || runMeta?.created_at || new Date().toISOString(),
      run_end: runMeta?.updated_at || new Date().toISOString(),
      total_wall: 0,
      crit_end_job: '',
      jobs: [],
      empty: true,
    }
  }

  const runStarted = parse(runMeta?.run_started_at) ?? parse(runMeta?.created_at)
  const jobCreates = jobs.map((j) => parse(j.created_at)).filter((v): v is number => v != null)
  const jobCompletes = jobs.map((j) => parse(j.completed_at)).filter((v): v is number => v != null)
  const runStart = runStarted ?? Math.min(...jobCreates)
  const runEnd = jobCompletes.length ? Math.max(...jobCompletes) : Date.now()

  // Critical path heuristic
  const completed = jobs.filter((j) => j.completed_at)
  const critJob = completed.length
    ? completed.reduce((acc, j) => ((j.completed_at! > acc.completed_at!) ? j : acc), completed[0])
    : jobs[0]
  const critIds = new Set<number>([critJob.id])
  const endTs = parse(critJob.completed_at) ?? runEnd
  for (const j of completed) {
    const jc = parse(j.completed_at)!
    const js = parse(j.started_at)
    if (js && endTs - jc < 180_000 && jc - js > 240_000) critIds.add(j.id)
  }

  const rows: JobRow[] = jobs.map((j) => {
    const created = parse(j.created_at)
    const started = parse(j.started_at)
    const completedTs = parse(j.completed_at)
    const steps = (j.steps || [])
      .map((s) => {
        const ss = parse(s.started_at)
        const sc = parse(s.completed_at)
        if (ss == null || sc == null || sc <= ss) return null
        return {
          name: s.name,
          number: s.number,
          conclusion: s.conclusion,
          rel_start: (ss - runStart) / 1000,
          rel_end: (sc - runStart) / 1000,
          dur: (sc - ss) / 1000,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
    const { groupKey, matrixIndex } = splitMatrix(j.name)
    return {
      id: j.id,
      name: j.name,
      conclusion: j.conclusion,
      status: j.status,
      rel_created: created != null ? (created - runStart) / 1000 : null,
      rel_started: started != null ? (started - runStart) / 1000 : null,
      rel_completed: completedTs != null ? (completedTs - runStart) / 1000 : null,
      queue_s: created != null && started != null ? (started - created) / 1000 : null,
      exec_s: started != null && completedTs != null ? (completedTs - started) / 1000 : null,
      runner_labels: j.labels || [],
      runner_name: j.runner_name,
      html_url: j.html_url,
      critical: critIds.has(j.id),
      steps,
      predecessors: [],
      group_key: groupKey,
      matrix_index: matrixIndex,
    }
  })

  // Annotate predecessors after rows are built so we can reference ids freely.
  const predMap = inferPredecessorMap(rows)
  for (const r of rows) r.predecessors = predMap.get(r.id) ?? []

  rows.sort((a, b) => {
    const aS = a.rel_started ?? a.rel_created ?? 0
    const bS = b.rel_started ?? b.rel_created ?? 0
    if (aS !== bS) return aS - bS
    return a.name.localeCompare(b.name)
  })

  return {
    ...baseMeta,
    run_start: new Date(runStart).toISOString(),
    run_end: new Date(runEnd).toISOString(),
    total_wall: (runEnd - runStart) / 1000,
    crit_end_job: critJob.name,
    jobs: rows,
  }
}

// No-queue transform: shift each job's start to "max(no-queue end of inferred upstream)",
// not just to its created_at. Reuses the predecessor map already attached to
// each JobRow during buildPayload (timing-inferred approximation of `needs:`).
export function applyNoQueue(run: RunPayload): RunPayload {
  if (run.empty) return run
  const cloned: RunPayload = JSON.parse(JSON.stringify(run))

  // Sort by actual rel_created so we resolve deps in topological-ish order.
  const order = [...cloned.jobs].sort((a, b) => (a.rel_created ?? 0) - (b.rel_created ?? 0))
  const noqEnd = new Map<number, number>()
  const noqStart = new Map<number, number>()

  for (const j of order) {
    const exec = j.exec_s ?? 0
    const candidates: number[] = []
    for (const predId of j.predecessors) {
      const end = noqEnd.get(predId)
      if (end != null) candidates.push(end)
    }
    const start = candidates.length ? Math.max(...candidates) : 0
    noqStart.set(j.id, start)
    noqEnd.set(j.id, start + exec)
  }

  // Apply shifts back to the cloned jobs and steps.
  let theoreticalEnd = 0
  for (const j of cloned.jobs) {
    const newStart = noqStart.get(j.id) ?? 0
    const newEnd = noqEnd.get(j.id) ?? newStart
    const oldStart = j.rel_started ?? j.rel_created ?? 0
    const shift = newStart - oldStart // negative = pulled earlier

    j.rel_created = newStart // visualise queue rectangle as zero-width starting at newStart
    j.rel_started = newStart
    j.rel_completed = newEnd
    j.queue_s = 0
    theoreticalEnd = Math.max(theoreticalEnd, newEnd)

    for (const s of j.steps) {
      s.rel_start = Math.max(0, s.rel_start + shift)
      s.rel_end = Math.max(0, s.rel_end + shift)
    }
  }

  cloned.total_wall_actual = run.total_wall
  cloned.total_wall = theoreticalEnd || run.total_wall
  cloned._noQueue = true
  return cloned
}
