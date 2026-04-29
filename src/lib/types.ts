// GH Actions REST API response shapes (subset we care about) + transformed payloads.

export interface GHStep {
  name: string
  status: string
  conclusion: string | null
  number: number
  started_at: string | null
  completed_at: string | null
}

export interface GHJob {
  id: number
  run_id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  labels: string[]
  runner_name: string | null
  runner_id: number | null
  html_url: string
  steps: GHStep[]
}

export interface GHRunMeta {
  id: number
  name: string
  display_title?: string
  head_branch: string
  head_sha: string
  event: string
  status: string
  conclusion: string | null
  run_attempt: number
  created_at: string
  run_started_at: string
  updated_at: string
  html_url: string
}

// Internal transformed shape — what the Gantt views consume.
export interface RowStep {
  name: string
  number: number
  conclusion: string | null
  rel_start: number
  rel_end: number
  dur: number
}

export interface JobRow {
  id: number
  name: string
  conclusion: string | null
  status: string
  rel_created: number | null
  rel_started: number | null
  rel_completed: number | null
  queue_s: number | null
  exec_s: number | null
  runner_labels: string[]
  runner_name: string | null
  html_url: string
  critical: boolean
  steps: RowStep[]
  // Inferred from timing: ids of jobs whose `completed_at` falls in the window
  // just before this job's `created_at`. Approximation of `needs:`.
  predecessors: number[]
  // Matrix grouping: e.g. "Run E2E Tests [6/12]" → group "Run E2E Tests".
  group_key: string
  matrix_index: string | null // "6/12" if matrix; null otherwise
}

export interface RunPayload {
  owner_repo: string
  run_id: string
  attempt: string
  run_url: string
  workflow_name: string
  head_branch: string
  head_sha: string
  event: string
  conclusion: string | null
  status: string
  run_attempt: number
  created_at: string
  run_start: string
  run_end: string
  total_wall: number
  total_wall_actual?: number
  crit_end_job: string
  jobs: JobRow[]
  empty?: boolean
  _noQueue?: boolean
}

// Branch run summary (lightweight; from /api/branch listing — no jobs yet).
export interface RunSummary {
  id: number
  run_attempt: number
  name: string
  head_branch: string
  head_sha: string
  event: string
  status: string
  conclusion: string | null
  created_at: string
  run_started_at: string
  updated_at: string
  html_url: string
}
