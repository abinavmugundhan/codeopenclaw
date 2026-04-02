import { useEffect, useMemo, useState } from 'react'
import { AuditEntry, LedgerSnapshot, PolicyConfig, PortfolioSummary } from './types'

const fetchJSON = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function StatCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {helper && <p className="text-xs text-slate-500 mt-1">{helper}</p>}
    </div>
  )
}

function usePolling<T>(path: string, ms: number, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    let active = true
    const tick = async () => {
      try {
        const d = await fetchJSON<T>(path)
        if (active) setData(d)
      } catch (e) {
        console.error(e)
      }
    }
    tick()
    const id = setInterval(tick, ms)
    return () => {
      active = false
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return data
}

export default function App() {
  const audit = usePolling<{ entries: string[] }>("/api/audit", 4000, [])
  const policy = usePolling<PolicyConfig>("/api/policy/json", 8000, [])
  const ledger = usePolling<LedgerSnapshot>("/api/ledger", 8000, [])
  const portfolio = usePolling<PortfolioSummary>("/api/portfolio", 10000, [])
  
  // Atomic Bot specific polling
  const atomicBalance = usePolling<any>("/api/atomic-balance", 10000, [])
  const atomicHistory = usePolling<any>("/api/atomic-history", 12000, [])

  const parsedAudit: AuditEntry[] | null = useMemo(() => {
    if (!audit?.entries) return null
    return audit.entries.map((line) => ({ timestamp: line.slice(0, 25), event: line.slice(27) }))
  }, [audit])

  const caps = useMemo(() => {
    if (!policy || !ledger) return null
    const total = ledger.totalQuantity
    return {
      perOrder: policy.limits.per_order_max_qty,
      perSymbol: policy.limits.per_symbol_daily_max_qty ?? 'n/a',
      daily: policy.limits.daily_max_qty,
      total,
    }
  }, [policy, ledger])

  const toggleMarketHours = async () => {
    if (!policy) return
    await fetchJSON('/api/market-hours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: !policy.limits.market_hours_only })
    })
  }

  // Atomic Bot direct LLM-to-API function
  const executeAtomicBotTrade = async (prompt: string) => {
    try {
      const result = await fetchJSON('/api/llm-to-atomic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      alert(`Atomic Bot Trade Executed: ${JSON.stringify(result, null, 2)}`)
    } catch (error) {
      alert(`Error: ${error.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500">OpenClaw Finance Agent</p>
          <h1 className="text-2xl font-semibold">Policy-Enforced Trading Dashboard</h1>
        </div>
        <button
          onClick={toggleMarketHours}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
        >
          Toggle Market Hours Guard
        </button>
      </header>

      <main className="p-6 grid gap-4" style={{ gridTemplateColumns: '1.1fr 0.9fr' }}>
        <section className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Daily Cap" value={caps?.daily ?? '—'} helper={`Used: ${caps?.total ?? 0}`} />
            <StatCard label="Per-Order" value={caps?.perOrder ?? '—'} />
            <StatCard label="Per-Symbol" value={caps?.perSymbol ?? '—'} />
            <StatCard label="Market Hours" value={policy?.limits.market_hours_only ? 'Enforced' : 'Off'} />
          </div>

          <div className="card h-[400px] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Live Audit Log</h2>
              <span className="text-xs text-slate-500">/api/audit</span>
            </div>
            <div className="space-y-2 text-sm">
              {parsedAudit?.map((row, idx) => (
                <div key={idx} className="flex items-start gap-3 border-b border-slate-800 pb-2">
                  <div className="text-xs text-slate-500 w-40 shrink-0">{row.timestamp}</div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-300 break-words">{row.event}</div>
                  </div>
                </div>
              )) || <p className="text-slate-500">No entries yet.</p>}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Policy Monitor</h2>
              <span className="text-xs text-slate-500">/api/policy/json</span>
            </div>
            {policy ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Allowlists</p>
                  <p>Tickers: {policy.limits.approved_symbols.join(', ')}</p>
                  <p>Assets: {policy.limits.allowed_asset_classes.join(', ')}</p>
                  <p>Actors: {policy.limits.allowed_actors.join(', ')}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Limits</p>
                  <p>Per-order: {policy.limits.per_order_max_qty}</p>
                  <p>Per-symbol/day: {policy.limits.per_symbol_daily_max_qty ?? '—'}</p>
                  <p>Daily aggregate: {policy.limits.daily_max_qty}</p>
                  <p>Blackout: {policy.limits.blackout?.start || 'none'} → {policy.limits.blackout?.end || 'none'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Rules</p>
                  <ul className="space-y-1">
                    {policy.policies.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span className={`badge ${p.effect === 'deny' ? 'bg-red-500/20 text-red-200' : 'bg-emerald-500/20 text-emerald-200'}`}>{p.effect.toUpperCase()}</span>
                        <span className="font-semibold">{p.id}</span>
                        <span className="text-slate-400 text-xs">{p.condition}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Loading policy…</p>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Trade Ledger</h2>
              <span className="text-xs text-slate-500">/api/ledger</span>
            </div>
            {ledger ? (
              <div className="space-y-2 text-sm">
                <p className="text-xs text-slate-500">Date (UTC): {ledger.date}</p>
                <p>Total Qty Today: {ledger.totalQuantity}</p>
                <div className="space-y-1">
                  {Object.entries(ledger.perSymbol).map(([sym, qty]) => (
                    <div key={sym} className="flex justify-between">
                      <span>{sym}</span>
                      <span className="text-slate-300">{qty}</span>
                    </div>
                  ))}
                  {Object.keys(ledger.perSymbol).length === 0 && <p className="text-slate-500 text-xs">No fills yet.</p>}
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Loading ledger…</p>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Portfolio (Alpaca)</h2>
              <span className="text-xs text-slate-500">/api/portfolio</span>
            </div>
            {portfolio ? (
              <div className="space-y-2 text-sm">
                <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all">{JSON.stringify(portfolio, null, 2)}</pre>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Loading portfolio…</p>
            )}
          </div>

          {/* Atomic Bot Section */}
          <div className="card border-2 border-blue-500/30">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-blue-400">🤖 Atomic Bot Direct Control</h2>
              <span className="text-xs text-blue-500">LLM-to-API</span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-2">Direct LLM-to-Atomic Bot Trading</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g., 'buy 2 shares of AAPL'"
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm"
                    id="atomic-prompt"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('atomic-prompt') as HTMLInputElement
                      if (input.value) executeAtomicBotTrade(input.value)
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
                  >
                    Execute
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Balance</p>
                  <pre className="text-xs bg-slate-800 p-2 rounded">
                    {atomicBalance ? JSON.stringify(atomicBalance, null, 2) : 'Loading...'}
                  </pre>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Recent Trades</p>
                  <pre className="text-xs bg-slate-800 p-2 rounded max-h-20 overflow-auto">
                    {atomicHistory ? JSON.stringify(atomicHistory, null, 2) : 'Loading...'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
