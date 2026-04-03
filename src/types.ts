export interface TradeIntent {
  action: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  asset_class: string;
  actor?: string;              // which agent/role initiated the intent (e.g., analyst, trader)
  delegated_by?: string;       // who delegated the authority (optional)
  delegated_limit?: number;    // max quantity permitted under delegation (optional)
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  failedPolicyId?: string;
}

export interface AtomicBotRequest {
  action: 'buy' | 'sell' | 'analyze' | 'status';
  symbol: string;
  quantity?: number;
  price?: number;
  parameters?: Record<string, any>;
}

export interface AtomicBotResponse {
  success: boolean;
  data?: any;
  error?: string;
  transactionId?: string;
  timestamp: string;
}

export interface PolicyRule {
  id: string;
  condition: string;
  effect: 'allow' | 'deny';
  description?: string;
}

export interface PolicyLimits {
  approved_symbols: string[];
  allowed_asset_classes: string[];
  allowed_actions: Array<'buy' | 'sell'>;
  allowed_actors: string[];
  per_order_max_qty: number;
  daily_max_qty: number;
  per_symbol_daily_max_qty?: number | null;
  market_hours_only: boolean;
  blackout?: { start: string | null; end: string | null };
}

export interface PolicyConfig {
  limits: PolicyLimits;
  policies: PolicyRule[];
}
