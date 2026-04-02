export type AuditEntry = {
  timestamp: string
  event: string
  intent?: any
  status?: string
  details?: any
}

export type PolicyLimits = {
  approved_symbols: string[]
  allowed_asset_classes: string[]
  allowed_actions: string[]
  allowed_actors: string[]
  per_order_max_qty: number
  per_symbol_daily_max_qty?: number | null
  daily_max_qty: number
  market_hours_only: boolean
  blackout?: { start: string | null; end: string | null }
}

export type PolicyRule = {
  id: string
  effect: 'allow' | 'deny'
  condition: string
  description?: string
}

export type PolicyConfig = {
  limits: PolicyLimits
  policies: PolicyRule[]
}

export type LedgerSnapshot = {
  date: string
  totalQuantity: number
  perSymbol: Record<string, number>
}

export type PortfolioSummary = {
  balance?: any
  history?: any
}
