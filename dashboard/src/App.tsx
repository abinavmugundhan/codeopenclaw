import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bell,
  BrainCircuit,
  ChevronDown,
  Database,
  LayoutGrid,
  Lock,
  Radar,
  Search,
  Shield,
  Sparkles,
  UserCircle2,
  Wallet,
} from 'lucide-react'
import { AuditEvent, IntentRecord, LedgerSnapshot, PolicyConfig, PolicyReason, ScenarioResult, SecurityStatus } from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

const toApiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!API_BASE_URL) return normalizedPath
  if (/\/api$/i.test(API_BASE_URL) && normalizedPath.startsWith('/api/')) {
    return `${API_BASE_URL}${normalizedPath.slice(4)}`
  }
  return `${API_BASE_URL}${normalizedPath}`
}

const fetchJSON = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(toApiUrl(path), init)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const presets = [
  { key: 'valid', label: 'Run Valid Trade', note: 'Safe AAPL order within limits.', expected: 'ALLOW' },
  { key: 'oversized', label: 'Simulate Oversized', note: 'Tests order-size and exposure caps.', expected: 'DENY' },
  { key: 'restricted', label: 'Unauthorized Asset', note: 'Attempts an asset outside the allowlist.', expected: 'DENY' },
  { key: 'afterhours', label: 'After-Hours Check', note: 'Forces market-hours enforcement.', expected: 'DENY' },
]

const nav = [
  ['Overview', LayoutGrid],
  ['Intent Monitor', BrainCircuit],
  ['Policy Layer', Shield],
  ['Security Center', Radar],
  ['Ledger', Wallet],
  ['Audit Timeline', Activity],
] as const

const toneMap = {
  slate: 'border-white/10 bg-white/5 text-slate-200',
  blue: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  amber: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  red: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
} as const

type Tone = keyof typeof toneMap

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneMap[tone]}`}>{children}</span>
}

function Panel({ title, eyebrow, children, className = '', actions }: { title: string; eyebrow: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

function MiniTrend({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = Math.max(max - min, 1)
  const width = 120
  const height = 40
  const path = points.map((value, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width
    const y = height - ((value - min) / range) * (height - 6) - 3
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-28"><path d={path} className={`fill-none stroke-[2.5] ${color}`} strokeLinecap="round" /></svg>
}

function TrendChart({ points }: { points: number[] }) {
  const width = 640
  const height = 220
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = Math.max(max - min, 1)
  const coords = points.map((value, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width
    const y = height - ((value - min) / range) * (height - 28) - 14
    return [x, y]
  })
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
      {[0, 1, 2, 3].map((row) => <line key={row} x1="0" x2={width} y1={20 + row * 50} y2={20 + row * 50} className="stroke-white/8" />)}
      <path d={area} fill="url(#trendFill)" />
      <path d={line} className="fill-none stroke-[3] stroke-sky-300" strokeLinecap="round" />
      <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(56,189,248,0.35)" /><stop offset="100%" stopColor="rgba(56,189,248,0.02)" /></linearGradient></defs>
    </svg>
  )
}

function Bars({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.value))
  return <div className="space-y-4">{items.map((item) => <div key={item.label}><div className="mb-2 flex justify-between text-sm text-slate-300"><span>{item.label}</span><span>{item.value}</span></div><div className="h-2 rounded-full bg-white/8"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400" style={{ width: `${(item.value / max) * 100}%` }} /></div></div>)}</div>
}

function Donut({ allowed, blocked }: { allowed: number; blocked: number }) {
  const total = Math.max(allowed + blocked, 1)
  const radius = 66
  const circumference = 2 * Math.PI * radius
  const allowOffset = circumference * (1 - allowed / total)
  const denyOffset = circumference * (1 - blocked / total)
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 180 180" className="h-40 w-40">
        <circle cx="90" cy="90" r={radius} className="fill-none stroke-white/8" strokeWidth="18" />
        <circle cx="90" cy="90" r={radius} className="fill-none stroke-emerald-300" strokeWidth="18" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={allowOffset} transform="rotate(-90 90 90)" />
        <circle cx="90" cy="90" r={radius} className="fill-none stroke-rose-300" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={denyOffset} transform="rotate(40 90 90)" />
        <text x="90" y="86" textAnchor="middle" className="fill-slate-500 text-[12px] uppercase tracking-[0.2em]">Decisions</text>
        <text x="90" y="108" textAnchor="middle" className="fill-white text-[24px] font-semibold">{total}</text>
      </svg>
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-sm text-slate-300">Allowed</p><p className="text-2xl font-semibold text-white">{allowed}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-sm text-slate-300">Blocked</p><p className="text-2xl font-semibold text-white">{blocked}</p></div>
      </div>
    </div>
  )
}

function ReasonRow({ reason }: { reason: PolicyReason }) {
  const severity: Tone = reason.severity === 'HIGH' ? 'red' : reason.severity === 'MEDIUM' ? 'amber' : 'slate'
  return <div className="rounded-2xl border border-white/8 bg-white/4 p-4"><div className="flex flex-wrap items-center gap-2"><Badge tone={reason.result === 'PASS' ? 'green' : 'red'}>{reason.result}</Badge><Badge tone={severity}>{reason.severity}</Badge>{reason.threat_type && <Badge tone="blue">{reason.threat_type}</Badge>}<span className="text-sm font-medium text-white">{reason.rule}</span></div><p className="mt-3 text-sm leading-6 text-slate-300">{reason.message}</p></div>
}

export default function App() {
  const [scenarioText, setScenarioText] = useState('buy 1 share of AAPL')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState('Last 24h')
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [timeline, setTimeline] = useState<AuditEvent[]>([])
  const [ledger, setLedger] = useState<LedgerSnapshot | null>(null)
  const [policy, setPolicy] = useState<PolicyConfig | null>(null)
  const [latestIntent, setLatestIntent] = useState<IntentRecord | null>(null)
  const [security, setSecurity] = useState<SecurityStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState('valid')

  const refresh = useCallback(async () => {
    const [audit, ledgerSnapshot, policySnapshot, latest, securitySnapshot] = await Promise.all([
      fetchJSON<{ events: AuditEvent[] }>('/api/audit/timeline'),
      fetchJSON<LedgerSnapshot>('/api/ledger/status'),
      fetchJSON<PolicyConfig>('/api/policy/json'),
      fetchJSON<{ intent: IntentRecord | null }>('/api/intent/latest'),
      fetchJSON<SecurityStatus>('/api/security/status'),
    ])
    setTimeline(audit.events || [])
    setLedger(ledgerSnapshot)
    setPolicy(policySnapshot)
    setLatestIntent(latest.intent || null)
    setSecurity(securitySnapshot)
  }, [])

  useEffect(() => {
    refresh().catch(console.error)
    const id = setInterval(() => refresh().catch(console.error), 4000)
    return () => clearInterval(id)
  }, [refresh])

  const runScenario = async (body: Record<string, string>) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchJSON<ScenarioResult>('/api/simulate/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setResult(response)
      await refresh()
    } catch (requestError: any) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const trend = useMemo(() => {
    const events = timeline.filter((event) => event.type === 'POLICY')
    if (events.length === 0) return [2, 3, 4, 4, 6, 5, 7]
    const buckets = Array.from({ length: 7 }, () => 0)
    events.slice(-21).forEach((_, index) => { buckets[index % 7] += 1 })
    return buckets.map((value, index) => value + index + 1)
  }, [timeline])
  const securityMap = security?.violations_by_type || {}
  const allowed = security?.total_allowed ?? 0
  const blocked = security?.total_blocked ?? 0
  const activeThreats = Object.values(securityMap).filter((count) => count > 0).length
  const currentIntent = result?.intent || latestIntent?.intent
  const decisionTone: Tone = result?.evaluation.decision === 'ALLOW' ? 'green' : result?.evaluation.decision === 'DENY' ? 'red' : 'amber'
  const decisionText = result ? (result.evaluation.decision === 'ALLOW' ? 'All security constraints passed. Execution remains gated until requested.' : `Blocked by ${result.evaluation.failedPolicyId || 'policy layer'}.`) : 'Run a simulation to inspect reasoning and enforcement.'
  const threatBars = Object.entries(securityMap).map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }))
  const exposureBars = Object.entries(ledger?.perSymbol || {}).map(([label, value]) => ({ label, value }))
  const feed = [...timeline].reverse().filter((event) => event.type !== 'INTENT').slice(0, 5)
  const rows = useMemo(() => {
    const grouped = new Map<string, { request: string; parsed: string; decision: string; threat: string; status: string; timestamp: string }>()
    timeline.forEach((event) => {
      const item = grouped.get(event.intentId) || { request: '', parsed: '', decision: 'PENDING', threat: '-', status: 'PENDING', timestamp: event.timestamp }
      if (event.type === 'INTENT') {
        item.request = event.payload?.scenario || item.request
        item.parsed = event.payload?.intent ? `${event.payload.intent.action} ${event.payload.intent.quantity} ${event.payload.intent.symbol}` : item.parsed
      }
      if (event.type === 'POLICY') {
        item.decision = event.payload?.decision || item.decision
        item.threat = event.threat_type || event.payload?.security_tags?.[0] || item.threat
      }
      if (event.type === 'EXECUTION') item.status = event.payload?.status || item.status
      item.timestamp = event.timestamp
      grouped.set(event.intentId, item)
    })
    return [...grouped.entries()].map(([intentId, row]) => ({ intentId, ...row })).reverse()
  }, [timeline]).filter((row) => [row.request, row.parsed, row.decision, row.threat, row.status].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0, 6)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-4 lg:px-6">
        <aside className="hidden w-72 flex-col rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:flex">
          <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950"><Sparkles className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.24em] text-slate-500">TrainAgent</p><p className="text-sm font-semibold text-white">Secure AI Control</p></div></div>
          <nav className="mt-8 space-y-2">{nav.map(([label, Icon], index) => <button key={label} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${index === 0 ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${index === 0 ? 'bg-cyan-400/15 text-cyan-200' : 'bg-white/5 text-slate-400'}`}><Icon className="h-4 w-4" /></span>{label}</button>)}</nav>
          <div className="mt-auto rounded-[28px] border border-cyan-400/15 bg-cyan-400/10 p-4"><div className="flex items-center gap-3"><Shield className="h-5 w-5 text-cyan-200" /><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Zero Trust</p><p className="text-sm leading-6 text-slate-200">Model output is untrusted until policy validation approves the action.</p></div></div></div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-6 flex flex-col gap-4 rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
            <div><p className="text-xs uppercase tracking-[0.24em] text-slate-500">Secure Autonomous Finance System</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">TrainAgent Security Dashboard</h1></div>
            <div className="flex flex-wrap items-center gap-3"><label className="flex min-w-[280px] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requests, policies, or threat tags" className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" /></label><button onClick={() => setRange(range === 'Last 24h' ? 'Last 7d' : 'Last 24h')} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{range}<ChevronDown className="h-4 w-4 text-slate-400" /></button><button className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-slate-300"><Bell className="h-4 w-4" /></button><div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"><UserCircle2 className="h-8 w-8 text-cyan-200" /><div><p className="text-sm font-medium text-white">Security Ops</p><p className="text-xs text-slate-500">Demo mode</p></div></div></div>
          </header>

          <main className="space-y-6">
            <section className="grid gap-5 xl:grid-cols-4">
              {[{ title: 'Total Evaluations', value: String(timeline.filter((event) => event.type === 'POLICY').length), note: `${timeline.length} timeline events`, icon: Database, tone: 'blue' as Tone, spark: trend, color: 'stroke-sky-300' }, { title: 'Allowed Actions', value: String(allowed), note: 'Policy-approved flow', icon: Shield, tone: 'green' as Tone, spark: trend.map((n, i) => Math.max(1, n - (i % 2))), color: 'stroke-emerald-300' }, { title: 'Blocked Actions', value: String(blocked), note: 'Shielded by policy', icon: Lock, tone: 'red' as Tone, spark: trend.map((n, i) => Math.max(1, Math.round(n / 2) + (i % 2))), color: 'stroke-rose-300' }, { title: 'Threat Signals', value: String(activeThreats), note: 'Active violation classes', icon: Radar, tone: 'amber' as Tone, spark: trend.map((n, i) => Math.max(1, Math.round(n / 3) + (i % 3))), color: 'stroke-amber-300' }].map((card) => <div key={card.title} className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-slate-400">{card.title}</p><p className="mt-3 text-4xl font-semibold text-white">{card.value}</p></div><span className={`grid h-12 w-12 place-items-center rounded-2xl ${toneMap[card.tone]}`}><card.icon className="h-5 w-5" /></span></div><div className="mt-5 flex items-end justify-between gap-3"><Badge tone={card.tone}>{card.note}</Badge><MiniTrend points={card.spark} color={card.color} /></div></div>)}
            </section>

            <section className="grid gap-5 xl:grid-cols-12">
              <Panel title="Intent Viewer" eyebrow="Natural language to structured intent" className="xl:col-span-7">
                <div className="grid gap-4 xl:grid-cols-[1.5fr_auto]">
                  <label className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4"><span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Scenario prompt</span><textarea value={scenarioText} onChange={(event) => setScenarioText(event.target.value)} rows={4} className="mt-3 w-full resize-none bg-transparent text-sm leading-7 text-white focus:outline-none" placeholder="Type a trading instruction for TrainAgent." /></label>
                  <div className="grid gap-3 xl:w-48"><button onClick={() => runScenario({ scenario: scenarioText })} disabled={loading} className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-90">{loading ? 'Running...' : 'Simulate Intent'}</button><button onClick={() => refresh()} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10">Refresh Data</button></div>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium text-white">Parsed JSON Intent</p><Badge tone="blue">Reasoning layer</Badge></div><pre className="min-h-[210px] whitespace-pre-wrap break-all text-xs leading-6 text-slate-300">{currentIntent ? JSON.stringify(currentIntent, null, 2) : '// Run a scenario to view the structured intent'}</pre></div>
                  <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-cyan-400/10 to-transparent p-4"><div className="flex items-center justify-between"><p className="text-sm font-medium text-white">Decision Status</p><Badge tone={decisionTone}>{result?.evaluation.decision || 'PENDING'}</Badge></div><p className="mt-4 text-sm leading-7 text-slate-300">{decisionText}</p><div className="mt-5 flex flex-wrap gap-2">{(result?.evaluation.security_tags || ['POLICY_GUARD']).map((tag) => <Badge key={tag} tone={tag === 'POLICY_GUARD' ? 'blue' : 'red'}>{tag}</Badge>)}</div>{error && <p className="mt-4 text-sm text-rose-300">{error}</p>}</div>
                </div>
              </Panel>

              <Panel title="Policy Enforcement Layer" eyebrow="Rule-by-rule evaluation" className="xl:col-span-5" actions={<Badge tone={decisionTone}>{result?.evaluation.decision || 'PENDING'}</Badge>}>
                <div className="space-y-3">{(result?.evaluation.reasons || []).map((reason) => <ReasonRow key={reason.rule} reason={reason} />)}{!result && <p className="text-sm text-slate-500">Run a simulation to inspect pass/fail reasoning, severity, and threat tags.</p>}</div>
              </Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-12">
              <Panel title="System Trend" eyebrow="Evaluation and enforcement volume" className="xl:col-span-8" actions={<Badge tone="blue">{range}</Badge>}><TrendChart points={trend} /></Panel>
              <Panel title="Security Overview" eyebrow="Policy posture" className="xl:col-span-4" actions={<Badge tone="green">ENFORCED</Badge>}><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">Allowed</p><p className="mt-2 text-3xl font-semibold text-white">{allowed}</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">Blocked</p><p className="mt-2 text-3xl font-semibold text-white">{blocked}</p></div></div><div className="mt-5 space-y-3">{threatBars.map((item) => <div key={item.label} className="flex items-center justify-between text-sm"><span className="capitalize text-slate-300">{item.label.toLowerCase()}</span><span className="font-medium text-white">{item.value}</span></div>)}</div><div className="mt-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/10 p-4"><p className="text-sm font-medium text-cyan-200">Zero Trust Indicator</p><p className="mt-2 text-sm leading-6 text-slate-300">LLM output is treated as untrusted input. All actions require policy validation before execution.</p></div></Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-12">
              <Panel title="Threat Breakdown" eyebrow="Violation categories" className="xl:col-span-4"><Bars items={threatBars.length > 0 ? threatBars : [{ label: 'No threats yet', value: 0 }]} /></Panel>
              <Panel title="Allowed vs Blocked" eyebrow="Decision distribution" className="xl:col-span-4"><Donut allowed={allowed} blocked={blocked} /></Panel>
              <Panel title="Quick Actions" eyebrow="Attack simulation" className="xl:col-span-4"><div className="space-y-3">{presets.map((preset) => <button key={preset.key} onClick={() => { setSelectedPreset(preset.key); runScenario({ preset: preset.key }) }} disabled={loading} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${selectedPreset === preset.key ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-white">{preset.label}</p><p className="mt-1 text-sm text-slate-400">{preset.note}</p></div><Badge tone={preset.expected === 'ALLOW' ? 'green' : 'red'}>{preset.expected}</Badge></div></button>)}</div></Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-12">
              <Panel title="Ledger Exposure" eyebrow="Per-symbol usage and daily tracking" className="xl:col-span-4"><div className="mb-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">UTC Date</p><p className="mt-2 text-lg font-semibold text-white">{ledger?.date || '--'}</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">Daily Qty</p><p className="mt-2 text-lg font-semibold text-white">{ledger?.totalQuantity ?? 0}</p></div></div><Bars items={exposureBars.length > 0 ? exposureBars : [{ label: 'No recorded fills', value: 0 }]} /></Panel>
              <Panel title="Notifications" eyebrow="Live alerts and insights" className="xl:col-span-4"><div className="space-y-3">{feed.map((event) => <div key={event.id} className="rounded-2xl border border-white/8 bg-white/4 p-4"><div className="flex items-start gap-3"><div className={`mt-0.5 grid h-9 w-9 place-items-center rounded-xl ${event.type === 'POLICY' ? 'bg-rose-400/10 text-rose-300' : 'bg-amber-400/10 text-amber-300'}`}>{event.type === 'POLICY' ? <Shield className="h-4 w-4" /> : <Activity className="h-4 w-4" />}</div><div><p className="text-sm font-medium text-white">{event.type === 'POLICY' ? 'Policy blocked an action' : 'Execution lifecycle update'}</p><p className="mt-1 text-sm leading-6 text-slate-300">{(event.decision_reason || event.explanation || JSON.stringify(event.payload)).slice(0, 160)}</p></div></div></div>)}{feed.length === 0 && <p className="text-sm text-slate-500">Run a simulation to populate the notification feed.</p>}</div></Panel>
              <Panel title="Execution Panel" eyebrow="Backend result" className="xl:col-span-4"><div className="flex items-center justify-between"><p className="text-sm font-medium text-white">Execution state</p><Badge tone={result?.execution?.status === 'SUCCESS' ? 'green' : result?.execution?.status === 'BLOCKED' ? 'red' : 'amber'}>{result?.execution?.status || 'SIMULATION'}</Badge></div><pre className="mt-4 min-h-[235px] whitespace-pre-wrap break-all rounded-[24px] border border-white/10 bg-slate-950/55 p-4 text-xs leading-6 text-slate-300">{result?.execution ? JSON.stringify(result.execution.details, null, 2) : '// Simulation mode: execution is intentionally skipped until you request a live paper trade.'}</pre></Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-12">
              <Panel title="Recent Activity" eyebrow="Latest requests and outcomes" className="xl:col-span-8"><div className="overflow-hidden rounded-[24px] border border-white/8 bg-black/10"><div className="grid grid-cols-[1.8fr_1.2fr_.8fr_1fr_.9fr_1fr] gap-4 border-b border-white/8 px-5 py-4 text-[11px] uppercase tracking-[0.2em] text-slate-500"><span>Request</span><span>Parsed Intent</span><span>Decision</span><span>Threat</span><span>Status</span><span>Timestamp</span></div><div className="divide-y divide-white/6">{rows.map((row) => <div key={row.intentId} className="grid grid-cols-[1.8fr_1.2fr_.8fr_1fr_.9fr_1fr] gap-4 px-5 py-4 text-sm text-slate-300 transition hover:bg-white/[0.04]"><span className="truncate">{row.request || '-'}</span><span className="truncate">{row.parsed || '-'}</span><span><Badge tone={row.decision === 'ALLOW' ? 'green' : row.decision === 'DENY' ? 'red' : 'amber'}>{row.decision}</Badge></span><span className="truncate">{row.threat}</span><span>{row.status}</span><span className="truncate text-slate-500">{new Date(row.timestamp).toLocaleTimeString()}</span></div>)}{rows.length === 0 && <div className="px-5 py-6 text-sm text-slate-500">No activity matches the current search filter.</div>}</div></div></Panel>
              <Panel title="Audit Timeline" eyebrow="Intent -> validation -> execution" className="xl:col-span-4"><div className="space-y-4">{timeline.slice(-8).reverse().map((event) => <div key={event.id} className="flex gap-3"><div className={`grid h-10 w-10 place-items-center rounded-2xl border ${event.type === 'POLICY' ? 'border-sky-400/25 bg-sky-400/10 text-sky-200' : event.type === 'EXECUTION' ? 'border-amber-400/25 bg-amber-400/10 text-amber-200' : 'border-white/10 bg-white/5 text-slate-200'}`}>{event.type === 'POLICY' ? <Shield className="h-4 w-4" /> : event.type === 'EXECUTION' ? <Activity className="h-4 w-4" /> : <BrainCircuit className="h-4 w-4" />}</div><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><Badge tone={event.type === 'POLICY' ? 'blue' : event.type === 'EXECUTION' ? 'amber' : 'slate'}>{event.type}</Badge>{event.threat_type && <Badge tone="red">{event.threat_type}</Badge>}<span className="text-xs uppercase tracking-[0.18em] text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</span></div><p className="mt-2 text-sm leading-6 text-slate-300">{event.decision_reason || event.explanation || JSON.stringify(event.payload)}</p></div></div>)}{timeline.length === 0 && <p className="text-sm text-slate-500">No audit events yet.</p>}</div></Panel>
            </section>

            <Panel title="Architecture View" eyebrow="Trust boundary"><div className="grid gap-3 xl:grid-cols-6">{['User Request', 'Reasoning Layer', 'Structured Intent', 'Policy Enforcement Layer', 'Execution Layer', 'Audit Log'].map((step, index) => <div key={step} className={`rounded-[24px] border p-4 text-center ${step === 'Policy Enforcement Layer' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-200'}`}><p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{String(index + 1).padStart(2, '0')}</p><p className="mt-3 text-sm font-medium">{step}</p></div>)}</div></Panel>
          </main>
        </div>
      </div>
    </div>
  )
}
