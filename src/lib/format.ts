// Display helpers.

export const fmt = (s: number | null | undefined): string => {
  if (s == null) return '—'
  s = Math.round(s)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}h${String(m).padStart(2, '0')}m${String(sec).padStart(2, '0')}s`
  if (m) return `${m}m${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

export const fmtSigned = (s: number | null | undefined): string => {
  if (s == null) return '—'
  const r = Math.round(s)
  if (r === 0) return '0s'
  const sign = r > 0 ? '+' : '−'
  return sign + fmt(Math.abs(r))
}

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const stepColor = (name: string, conclusion: string | null): string => {
  const n = (name || '').toLowerCase()
  if (conclusion === 'failure') return '#ef4444'
  if (conclusion === 'cancelled' || conclusion === 'skipped') return '#6b7280'
  if (
    n.startsWith('post ') ||
    n.startsWith('upload') ||
    n.includes('complete job') ||
    n.includes('stop containers')
  )
    return '#f59e0b'
  if (
    n.startsWith('set up') ||
    n.startsWith('setup') ||
    n.startsWith('initialize') ||
    n.startsWith('checkout') ||
    n.includes('cache/checkout')
  )
    return '#3b82f6'
  return '#10b981'
}

export const shortRunner = (labels: string[] | null | undefined, runnerName: string | null): string => {
  const ls = labels || []
  const pick =
    ls.find((l) => /warp-custom|self-hosted/i.test(l)) || ls[0] || runnerName || '?'
  let s = pick
  s = s.replace(/^warp-custom-cula-ubuntu-2404-x64-/, 'warp-')
  s = s.replace(/^warp-custom-/, 'warp:')
  s = s.replace(/^ubuntu-(\d+)\.04/, 'gh-u$1')
  s = s.replace(/^macos-/, 'mac-')
  s = s.replace(/^windows-/, 'win-')
  if (s.length > 22) s = s.slice(0, 19) + '…'
  return s
}

// Map a runner label to the VM family WarpBuild attaches under it. Maintained
// by hand from the WarpBuild stack `cula-warp-build-pulumi`. Update when a new
// runner label is registered or its config changes.
const RUNNER_INSTANCE: Record<string, string> = {
  'warp-custom-cula-ubuntu-2404-x64-2x': 'n4-standard-2',
  'warp-custom-cula-ubuntu-2404-x64-4x': 'c4-standard-4',
  'warp-custom-cula-ubuntu-2404-x64-8x': 'c4-standard-8',
  'warp-custom-cula-ubuntu-2404-x64-8x-jest': 'c4-standard-8 (jest image)',
  'warp-custom-cula-ubuntu-2404-x64-16x': 'c4-standard-16',
  // legacy stack (cula-wrap-build), being phased out
  'warp-custom-linux-x86-docker-intensive': 'c3-standard-8-lssd',
  'warp-custom-spike1': 'spike1 (legacy)',
}

export const runnerInstance = (
  labels: string[] | null | undefined,
  runnerName: string | null,
): string | null => {
  const ls = labels || []
  for (const l of ls) {
    if (RUNNER_INSTANCE[l]) return RUNNER_INSTANCE[l]
  }
  if (ls.some((l) => /^warp-ubuntu-\d{4}-x64-\d+x$/.test(l))) return 'warp cloud'
  if (ls.some((l) => /^ubuntu-\d+\.\d+/.test(l))) return 'gh-hosted'
  if (ls.some((l) => /^macos-/.test(l))) return 'gh-hosted'
  if (ls.some((l) => /^windows-/.test(l))) return 'gh-hosted'
  if (runnerName && /^blacksmith-/.test(runnerName)) return 'blacksmith'
  return null
}

export const runnerColor = (label: string): string => {
  const l = (label || '').toLowerCase()
  if (l.startsWith('warp')) return '#60a5fa'
  if (l.startsWith('blacksmith')) return '#a78bfa'
  if (l.startsWith('mac')) return '#fbbf24'
  if (l.startsWith('win')) return '#06b6d4'
  if (l.startsWith('gh-u') || l.includes('ubuntu')) return '#f59e0b'
  if (l.startsWith('self')) return '#34d399'
  return '#9ca3af'
}

// Parse a GH Actions run URL or ID. Returns null if unrecognized.
export interface ParsedRun {
  ownerRepo: string
  runId: string
  attempt: string
}
export const parseRunUrl = (input: string): ParsedRun | null => {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) {
    const repoMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/)
    if (!repoMatch) return null
    const ownerRepo = `${repoMatch[1]}/${repoMatch[2]}`
    const runId = repoMatch[3]
    const attemptMatch = trimmed.match(/\/attempts\/(\d+)/)
    return { ownerRepo, runId, attempt: attemptMatch?.[1] || '' }
  }
  // bare id
  if (/^\d+$/.test(trimmed)) {
    return { ownerRepo: '', runId: trimmed, attempt: '' }
  }
  return null
}
