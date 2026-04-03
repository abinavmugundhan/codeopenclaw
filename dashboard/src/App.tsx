import { useEffect, useMemo, useState } from 'react'
import {
  AuditEvent,
  ExecutionRecord,
  IntentRecord,
  LedgerSnapshot,
  PolicyConfig,
  PolicyEvaluation,
  PolicyReason,
  PortfolioSummary,
  ScenarioResult,
} from './types'

const fetchJSON = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const presets = [
  { key: 'valid', label: 'Valid Trade', tone: 'green' },
  { key: 'oversized', label: 'Oversized Trade', tone: 'orange' },
  { key: 'restricted', label: 'Restricted Asset', tone: 'red' },
  { key: 'afterhours', label: 'After Market Hours', tone: 'purple' },
]

function Badge({ text, tone = 'slate' }: { text: string; tone?: 'green' | 'red' | 'orange' | 'slate' | 'purple' }) {
  const tones: Record<string, string> = {
    green: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30',
    red: 'bg-red-500/20 text-red-200 border border-red-500/30',
    orange: 'bg-orange-500/20 text-orange-200 border border-orange-500/30',
    slate: 'bg-slate-700/50 text-slate-100 border border-slate-600',
    purple: 'bg-purple-500/20 text-purple-200 border border-purple-500/30',
  }
  return <span className={`text-xs px-2 py-1 rounded-full font-semibold ${tones[tone] || tones.slate}`}>{text}</span>
}

function ReasonRow({ reason }: { reason: PolicyReason }) {
  const tone = reason.result === 'PASS' ? 'green' : 'red'
  return (
    <div className="flex items-start justify-between border border-slate-800 rounded-lg px-3 py-2 bg-slate-900/60">
      <div>
        <div className="flex items-center gap-2">
          <Badge text={reason.result} tone={tone} />
          <span className="font-semibold text-sm">{reason.rule}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">{reason.effect}</span>
        </div>
        <p className="text-xs text-slate-400 mt-1">{reason.message}</p>
      </div>
    </div>
  )
}

function LedgerBars({ ledger }: { ledger: LedgerSnapshot | null }) {
  if (!ledger) return <p className="text-slate-500 text-sm">Loading ledger…</p>
  const max = Math.max(1, ...Object.values(ledger.perSymbol))
  return (
    <div className="space-y-2">
      {Object.entries(ledger.perSymbol).map(([sym, qty]) => (
        <div key={sym}>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{sym}</span>
            <span>{qty}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded">
            <div className="h-full bg-emerald-500 rounded" style={{ width: `${(qty / max) * 100}%` }} />
          </div>
        </div>
      ))}
      {Object.keys(ledger.perSymbol).length === 0 && <p className="text-slate-500 text-xs">No fills yet.</p>}
    </div>
  )
}

function Timeline({ events }: { events: AuditEvent[] }) {
  return (
    <div className="space-y-3 text-sm">
      {events.map((e) => (
        <div key={e.id} className="flex gap-3 items-start">
          <div className="w-28 text-xs text-slate-500">{new Date(e.timestamp).toLocaleTimeString()}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge text={e.type} tone={e.type === 'EXECUTION' ? 'orange' : e.type === 'POLICY' ? 'purple' : 'slate'} />
              <span className="text-xs text-slate-500">{e.intentId}</span>
            </div>
            <pre className="text-xs text-slate-200 bg-slate-900/70 border border-slate-800 rounded p-2 mt-1 whitespace-pre-wrap break-all">
              {JSON.stringify(e.payload, null, 2)}
            </pre>
          </div>
        </div>
      ))}
      {events.length === 0 && <p className="text-slate-500 text-sm">No audit events yet.</p>}
    </div>
  )
}

export default function App() {
  const [scenarioText, setScenarioText] = useState('buy 1 share of AAPL')
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [timeline, setTimeline] = useState<AuditEvent[]>([])
  const [ledger, setLedger] = useState<LedgerSnapshot | null>(null)
  const [policy, setPolicy] = useState<PolicyConfig | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [latestIntent, setLatestIntent] = useState<IntentRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Polling hooks
  useEffect(() => {
    const poll = async () => {
      try {
        const [tl, led, pol, port, latest] = await Promise.all([
          fetchJSON<{ events: AuditEvent[] }>('/api/audit/timeline'),
          fetchJSON<LedgerSnapshot>('/api/ledger/status'),
          fetchJSON<PolicyConfig>('/api/policy/json'),
          fetchJSON<PortfolioSummary>('/api/portfolio'),
          fetchJSON<{ intent: IntentRecord | null }>('/api/intent/latest'),
        ])
        setTimeline(tl.events || [])
        setLedger(led)
        setPolicy(pol)
        setPortfolio(port)
        setLatestIntent(latest.intent || null)
      } catch (e) {
        console.error(e)
      }
    }
    poll()
    const id = setInterval(poll, 4000)
    return () => clearInterval(id)
  }, [])

  const runPreset = async (preset: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchJSON<ScenarioResult>('/api/simulate/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      })
      setResult(res)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const runCustom = async () => {
    if (!scenarioText.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchJSON<ScenarioResult>('/api/simulate/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scenarioText }),
      })
      setResult(res)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const decisionTone = useMemo<'green' | 'red' | 'orange'>(() => {
    if (!result) return 'orange'
    return result.evaluation.decision === 'ALLOW' ? 'green' : 'red'
  }, [result])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500">OpenClaw + ArmorClaw</p>
          <h1 className="text-2xl font-semibold">Explainable Enforcement Dashboard</h1>
        </div>
        <Badge text="Live" tone="green" />
      </header>

      <main className="p-6 grid gap-4 xl:grid-cols-3">
        <section className="xl:col-span-2 space-y-4">
          <div className="card space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-500">Intent Viewer</p>
                <h2 className="text-lg font-semibold">Natural Language → Structured Intent</h2>
              </div>
              {result && <Badge text={result.evaluation.decision} tone={decisionTone} />}
            </div>
            <div className="flex gap-3">
              <input
                value={scenarioText}
                onChange={(e) => setScenarioText(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded"
                placeholder="e.g., buy 2 shares of AAPL"
              />
              <button
                onClick={runCustom}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm disabled:opacity-50"
                disabled={loading}
              >
                Simulate
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Parsed Intent</p>
                <pre className="bg-slate-900 border border-slate-800 rounded p-3 text-xs whitespace-pre-wrap break-all min-h-[140px]">
                  {result ? JSON.stringify(result.intent, null, 2) : latestIntent ? JSON.stringify(latestIntent.intent, null, 2) : '—'}
                </pre>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Evaluation Decision</p>
                {result ? (
                  <div className="space-y-2">
                    <Badge text={result.evaluation.decision} tone={decisionTone} />
                    <p className="text-sm text-slate-300">
                      {result.evaluation.decision === 'ALLOW'
                        ? 'All guards satisfied'
                        : `Blocked by ${result.evaluation.failedPolicyId || 'policy'}`}
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Run a scenario to see evaluation.</p>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Policy Evaluation (rule-by-rule)</h3>
                <span className="text-xs text-slate-500">color-coded pass/fail</span>
              </div>
              <div className="space-y-2">
                {result?.evaluation.reasons.map((r) => (
                  <ReasonRow key={r.rule} reason={r} />
                )) || <p className="text-slate-500 text-sm">Awaiting evaluation…</p>}
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Execution Panel</h3>
                <span className="text-xs text-slate-500">status + backend response</span>
              </div>
              {result?.execution ? (
                <div className="space-y-2">
                  <Badge
                    text={result.execution.status}
                    tone={
                      result.execution.status === 'SUCCESS'
                        ? 'green'
                        : result.execution.status === 'BLOCKED'
                        ? 'red'
                        : 'orange'
                    }
                  />
                  <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 whitespace-pre-wrap break-all">
                    {JSON.stringify(result.execution.details, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Simulation mode: execution skipped.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Ledger Visualization</h3>
              <span className="text-xs text-slate-500">per-symbol + daily exposure</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">Date (UTC): {ledger?.date || '—'} | Daily cap: {policy?.limits.daily_max_qty}</p>
            <LedgerBars ledger={ledger} />
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Audit Timeline</h3>
              <span className="text-xs text-slate-500">Intent → Policy → Execution</span>
            </div>
            <Timeline events={timeline.slice(-20)} />
          </div>
        </section>

        <section className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Scenario Simulator</h3>
              <span className="text-xs text-slate-500">one-click demos</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <button
                  key={p.key}
                  onClick={() => runPreset(p.key)}
                  className="px-3 py-2 rounded bg-slate-900 border border-slate-800 hover:border-slate-600 text-sm text-left"
                  disabled={loading}
                >
                  <div className="flex items-center gap-2">
                    <Badge text={p.label} tone={p.tone as any} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Simulated & logged</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Policy Snapshot</h3>
              <span className="text-xs text-slate-500">live from policy.yaml</span>
            </div>
            {policy ? (
              <div className="space-y-2 text-sm">
                <p className="text-xs text-slate-500">Allowlists</p>
                <p>Tickers: {policy.limits.approved_symbols.join(', ')}</p>
                <p>Actors: {policy.limits.allowed_actors.join(', ')}</p>
                <p>Asset classes: {policy.limits.allowed_asset_classes.join(', ')}</p>
                <p className="text-xs text-slate-500 mt-2">Caps</p>
                <p>Per-order: {policy.limits.per_order_max_qty}</p>
                <p>Per-symbol/day: {policy.limits.per_symbol_daily_max_qty ?? '—'}</p>
                <p>Daily: {policy.limits.daily_max_qty}</p>
                <p>Market hours enforced: {policy.limits.market_hours_only ? 'Yes' : 'No'}</p>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Loading policy…</p>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Portfolio (mock for demo)</h3>
              <span className="text-xs text-slate-500">/api/portfolio</span>
            </div>
            <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-3 whitespace-pre-wrap break-all">
              {portfolio ? JSON.stringify(portfolio, null, 2) : 'Loading…'}
            </pre>
          </div>
        </section>
      </main>
    </div>
  )
}
