// Frontend API client — calls our Bun proxy, which uses Octokit.
import type { GHJob, GHRunMeta, RunSummary } from './types'
import { getAuthHeaders } from './auth'

function getSessionId(): string | null {
  return localStorage.getItem('gh-session')
}

async function get<T>(url: string): Promise<T> {
  const headers = getAuthHeaders(getSessionId())
  const r = await fetch(url, { headers })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`${r.status} ${r.statusText} — ${body.slice(0, 300)}`)
  }
  return r.json() as Promise<T>
}

export async function fetchRunMeta(
  ownerRepo: string,
  runId: string,
  attempt: string,
): Promise<GHRunMeta> {
  const q = attempt ? `?attempt=${attempt}` : ''
  return get<GHRunMeta>(`/api/runs/${ownerRepo}/${runId}${q}`)
}

export async function fetchRunJobs(
  ownerRepo: string,
  runId: string,
  attempt: string,
): Promise<GHJob[]> {
  const q = attempt ? `?attempt=${attempt}` : ''
  // backend returns array of jobs (handles pagination)
  return get<GHJob[]>(`/api/runs/${ownerRepo}/${runId}/jobs${q}`)
}

export async function fetchBranchRuns(
  ownerRepo: string,
  branch: string,
  limit = 10,
): Promise<RunSummary[]> {
  return get<RunSummary[]>(
    `/api/branch/${ownerRepo}/${encodeURIComponent(branch)}?limit=${limit}`,
  )
}
