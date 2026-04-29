// Frontend API client — calls our Bun proxy, which calls gh CLI.
import type { GHJob, GHRunMeta, RunSummary } from './types'

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url)
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
  // backend returns slurped paginated array of {jobs: [...]} pages.
  const pages = await get<{ jobs?: GHJob[] }[]>(`/api/runs/${ownerRepo}/${runId}/jobs${q}`)
  return pages.flatMap((p) => p.jobs || [])
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
