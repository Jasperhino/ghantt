// Top-level UI: URL or branch input → fetch runs → render single or compare with no-queue toggle.
import { useEffect, useMemo, useState } from 'react'
import { fetchBranchRuns, fetchRunJobs, fetchRunMeta } from '@/lib/api'
import { applyNoQueue, buildPayload } from '@/lib/transform'
import { useAuth } from '@/lib/auth'
import { fmt, fmtDate, parseRunUrl } from '@/lib/format'
import type { RunPayload, RunSummary } from '@/lib/types'
import { GanttSingle } from '@/components/GanttSingle'
import { GanttCompare } from '@/components/GanttCompare'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

type Mode = 'single' | 'compare'

interface LoadedRun {
  key: string // ownerRepo|runId|attempt
  payload: RunPayload
}

const runKey = (ownerRepo: string, id: string, attempt: string) => `${ownerRepo}|${id}|${attempt || ''}`

const labelFor = (r: RunPayload) =>
  `#${r.run_id}${r.attempt ? `/a${r.attempt}` : ''} · ${r.head_sha || ''} · ${fmtDate(r.run_start)} · ${fmt(r.total_wall)} · ${r.conclusion || r.status || ''}`

export default function App() {
  const { authenticated, user, login } = useAuth()
  
  // Inputs
  const [runUrl, setRunUrl] = useState('')
  const [branchOwnerRepo, setBranchOwnerRepo] = useState('Cula-Technologies/cula-platform')
  const [branchName, setBranchName] = useState('')
  const [branchLimit, setBranchLimit] = useState(8)

  // State
  const [runs, setRuns] = useState<LoadedRun[]>([])
  const [mode, setMode] = useState<Mode>('single')
  const [selA, setSelA] = useState<string>('')
  const [selB, setSelB] = useState<string>('')
  const [noQueue, setNoQueue] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [branchSummary, setBranchSummary] = useState<RunSummary[]>([])

  const addRun = async (ownerRepo: string, runId: string, attempt: string): Promise<LoadedRun> => {
    const key = runKey(ownerRepo, runId, attempt)
    const existing = runs.find((r) => r.key === key)
    if (existing) return existing
    const [meta, jobs] = await Promise.all([
      fetchRunMeta(ownerRepo, runId, attempt),
      fetchRunJobs(ownerRepo, runId, attempt),
    ])
    const payload = buildPayload(ownerRepo, runId, attempt, meta, jobs)
    const loaded = { key, payload }
    setRuns((prev) => {
      if (prev.some((r) => r.key === key)) return prev
      return [...prev, loaded].sort((a, b) =>
        (b.payload.created_at || '').localeCompare(a.payload.created_at || ''),
      )
    })
    return loaded
  }

  const handleLoadRun = async () => {
    setError(''); setLoading(true)
    try {
      const parsed = parseRunUrl(runUrl)
      if (!parsed || !parsed.ownerRepo) throw new Error('Paste a full run URL (https://github.com/owner/repo/actions/runs/<id>[/attempts/<n>])')
      const loaded = await addRun(parsed.ownerRepo, parsed.runId, parsed.attempt)
      setSelA(loaded.key)
      setBranchSummary([]) // Clear branch summary when loading a specific run
      if (mode === 'compare' && !selB) {
        const others = runs.filter((r) => r.key !== loaded.key)
        if (others[0]) setSelB(others[0].key)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadBranch = async () => {
    setError(''); setLoading(true)
    try {
      if (!branchOwnerRepo || !branchName) throw new Error('Fill owner/repo and branch')
      const summary = await fetchBranchRuns(branchOwnerRepo, branchName, branchLimit)
      setBranchSummary(summary)
      if (summary.length > 0) {
        const first = summary[0]
        const loaded = await addRun(branchOwnerRepo, String(first.id), '')
        setSelA(loaded.key)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const ensureLoadedFromSummary = async (s: RunSummary) => {
    setError(''); setLoading(true)
    try {
      return await addRun(branchOwnerRepo, String(s.id), '')
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setLoading(false)
    }
  }

  // Auto-pick A and B in compare mode
  useEffect(() => {
    if (mode === 'compare') {
      // Use setTimeout to avoid synchronous setState
      setTimeout(() => {
        if (!selA && runs[0]) setSelA(runs[0].key)
        if (!selB) {
          const other = runs.find((r) => r.key !== selA)
          if (other) setSelB(other.key)
        }
      }, 0)
    }
  }, [mode, runs, selA, selB])

  const runA = useMemo(() => {
    const r = runs.find((x) => x.key === selA)?.payload
    return r ? (noQueue ? applyNoQueue(r) : r) : null
  }, [runs, selA, noQueue])

  const runB = useMemo(() => {
    const r = runs.find((x) => x.key === selB)?.payload
    return r ? (noQueue ? applyNoQueue(r) : r) : null
  }, [runs, selB, noQueue])

  return (
    <div className="min-h-screen p-6 space-y-4 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">gh-gantt</h1>
          <p className="text-sm text-muted-foreground">
            Per-step Gantt + queue analysis for GitHub Actions runs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {authenticated ? (
            <>
              <span className="text-sm text-muted-foreground">Signed in as {user?.login}</span>
              {user?.avatar_url && (
                <img src={user.avatar_url} alt={user.login} className="w-8 h-8 rounded-full" />
              )}
            </>
          ) : (
            <Button onClick={login} variant="outline">Sign in with GitHub</Button>
          )}
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Load run by URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://github.com/owner/repo/actions/runs/123/attempts/2"
                  value={runUrl}
                  onChange={(e) => setRunUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLoadRun()}
                />
                <Button onClick={handleLoadRun} disabled={loading}>Load</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Load last N runs on a branch</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="owner/repo"
                  value={branchOwnerRepo}
                  onChange={(e) => setBranchOwnerRepo(e.target.value)}
                  className="max-w-[260px]"
                />
                <Input
                  placeholder="branch"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLoadBranch()}
                />
                <Input
                  type="number"
                  value={branchLimit}
                  onChange={(e) => setBranchLimit(Number(e.target.value) || 8)}
                  className="w-20"
                />
                <Button onClick={handleLoadBranch} disabled={loading}>Load</Button>
              </div>
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>

      {branchSummary.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {branchOwnerRepo} · {branchName} ({branchSummary.length} runs)
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>when</TableHead>
                  <TableHead>workflow</TableHead>
                  <TableHead>conclusion</TableHead>
                  <TableHead>sha</TableHead>
                  <TableHead className="text-right">actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchSummary.map((s) => {
                  const k = runKey(branchOwnerRepo, String(s.id), '')
                  const loaded = runs.some((r) => r.key === k)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="tabular-nums">{s.id}</TableCell>
                      <TableCell>{fmtDate(s.run_started_at || s.created_at)}</TableCell>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>
                        <Badge variant={s.conclusion === 'success' ? 'default' : s.conclusion === 'failure' ? 'destructive' : 'secondary'}>
                          {s.conclusion || s.status || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{(s.head_sha || '').slice(0, 7)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm" variant="outline"
                          onClick={async () => {
                            const r = loaded ? runs.find((x) => x.key === k)! : await ensureLoadedFromSummary(s)
                            if (r) { setMode('single'); setSelA(r.key) }
                          }}
                        >view</Button>
                        <Button
                          size="sm" variant="outline"
                          onClick={async () => {
                            const r = loaded ? runs.find((x) => x.key === k)! : await ensureLoadedFromSummary(s)
                            if (r) { setMode('compare'); setSelA(r.key) }
                          }}
                        >A</Button>
                        <Button
                          size="sm" variant="outline"
                          onClick={async () => {
                            const r = loaded ? runs.find((x) => x.key === k)! : await ensureLoadedFromSummary(s)
                            if (r) {
                              setMode('compare')
                              setSelB(r.key)
                              if (!selA && runs[0]) setSelA(runs[0].key)
                            }
                          }}
                        >B</Button>
                        <a className="text-primary hover:underline text-xs ml-1" href={s.html_url} target="_blank" rel="noreferrer">↗</a>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {runs.length > 0 && (
        <Card>
          <CardContent className="py-3 flex flex-wrap items-center gap-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList>
                <TabsTrigger value="single">Single</TabsTrigger>
                <TabsTrigger value="compare" disabled={runs.length < 2}>Compare A vs B</TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === 'single' ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Run:</Label>
                <Select value={selA} onValueChange={setSelA}>
                  <SelectTrigger className="min-w-[420px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {runs.map((r) => (
                      <SelectItem key={r.key} value={r.key}>{labelFor(r.payload)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs">A:</Label>
                <Select value={selA} onValueChange={setSelA}>
                  <SelectTrigger className="min-w-[360px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {runs.map((r) => (
                      <SelectItem key={r.key} value={r.key}>{labelFor(r.payload)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="text-xs">B:</Label>
                <Select value={selB} onValueChange={setSelB}>
                  <SelectTrigger className="min-w-[360px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {runs.filter((r) => r.key !== selA).map((r) => (
                      <SelectItem key={r.key} value={r.key}>{labelFor(r.payload)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Switch id="no-q" checked={noQueue} onCheckedChange={setNoQueue} />
              <Label htmlFor="no-q" className="text-xs cursor-pointer">
                Hide queue (theoretical wall — every job starts at <code className="font-mono">created_at</code>)
              </Label>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === 'single' && runA && <GanttSingle run={runA} />}
      {mode === 'compare' && runA && runB && <GanttCompare runA={runA} runB={runB} />}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  )
}
