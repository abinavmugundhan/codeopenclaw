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

export type PolicyReason = {
  rule: string
  result: 'PASS' | 'FAIL'
  message: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  threat_type?: 'RISK_LIMIT' | 'TIME_VIOLATION' | 'UNAUTHORIZED_ASSET' | 'POLICY_BREACH'
  effect?: 'allow' | 'deny'
}

export type PolicyEvaluation = {
  id: string
  decision: 'ALLOW' | 'DENY'
  reasons: PolicyReason[]
  security_tags: string[]
  failedPolicyId?: string
  allowed: boolean
}

export type ExecutionRecord = {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'BLOCKED'
  backend?: 'alpaca' | 'atomic-bot'
  details?: any
}

export type IntentRecord = {
  id: string
  scenario: string
  intent: any
  createdAt: string
}

export type AuditEvent = {
  id: string
  intentId: string
  type: 'INTENT' | 'POLICY' | 'EXECUTION'
  timestamp: string
  payload: any
  threat_type?: string
  decision_reason?: string
  explanation?: string
}

export type ScenarioResult = {
  intentId: string
  intent: any
  evaluation: PolicyEvaluation
  execution: ExecutionRecord | null
  preset?: string
}

export type SecurityStatus = {
  total_allowed: number
  total_blocked: number
  violations_by_type: Record<string, number>
  enforced: boolean
}
