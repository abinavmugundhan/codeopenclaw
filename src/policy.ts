import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { TradeIntent, PolicyResult, PolicyConfig } from './types';
import { TradeLedger } from './ledger';

type PolicyPredicate = (intent: TradeIntent) => boolean;

export class PolicyEngine {
  private config: PolicyConfig;
  private ledger: TradeLedger;
  private predicates: Record<string, PolicyPredicate>;

  constructor(policyFilePath: string, ledger: TradeLedger) {
    this.ledger = ledger;
    this.config = this.loadConfig(policyFilePath);
    this.predicates = this.buildPredicates();
    console.log(`[PolicyEngine] Loaded ${this.config.policies.length} policies.`);
  }

  private loadConfig(filePath: string): PolicyConfig {
    const resolved = path.resolve(filePath);
    const fallback: PolicyConfig = {
      limits: {
        approved_symbols: ['AAPL', 'MSFT', 'TSLA'],
        allowed_asset_classes: ['equity'],
        allowed_actions: ['buy', 'sell'],
        allowed_actors: ['analyst', 'trader', 'risk', 'system'],
        per_order_max_qty: 5,
        daily_max_qty: 20,
        per_symbol_daily_max_qty: 10,
        market_hours_only: true,
        blackout: { start: null, end: null },
      },
      policies: [],
    };

    try {
      const fileContents = fs.readFileSync(resolved, 'utf8');
      const data = yaml.load(fileContents) as PolicyConfig;
      return { ...fallback, ...data, limits: { ...fallback.limits, ...(data?.limits || {}) } };
    } catch (e) {
      console.error(`[PolicyEngine] Failed to load policies from ${resolved}:`, e);
      return fallback;
    }
  }

  private buildPredicates(): Record<string, PolicyPredicate> {
    const { limits } = this.config;

    return {
      asset_class_allowed: (intent) =>
        limits.allowed_asset_classes.includes(intent.asset_class),

      action_allowed: (intent) =>
        limits.allowed_actions.includes(intent.action),

      symbol_allowed: (intent) =>
        limits.approved_symbols.includes(intent.symbol),

      per_order_limit: (intent) =>
        intent.quantity <= limits.per_order_max_qty,

      daily_limit: (intent) => {
        const { projectedTotal } = this.ledger.projectWith(intent);
        return projectedTotal <= limits.daily_max_qty;
      },

      per_symbol_daily_limit: (intent) => {
        if (!limits.per_symbol_daily_max_qty) return true;
        const { projectedSymbolTotal } = this.ledger.projectWith(intent);
        return projectedSymbolTotal <= limits.per_symbol_daily_max_qty;
      },

      market_hours: () => {
        if (!limits.market_hours_only) return true;
        const now = new Date();
        const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const h = ny.getHours();
        const m = ny.getMinutes();
        const afterOpen = h > 9 || (h === 9 && m >= 30);
        const beforeClose = h < 16;
        return afterOpen && beforeClose;
      },

      blackout_window: () => {
        const { blackout } = limits;
        if (!blackout?.start || !blackout?.end) return false;
        const now = new Date();
        const start = new Date(blackout.start);
        const end = new Date(blackout.end);
        return now >= start && now <= end;
      },

      actor_allowed: (intent) => {
        if (!intent.actor) return true;
        return limits.allowed_actors.includes(intent.actor);
      },

      delegation_limit: (intent) => {
        if (intent.delegated_limit == null) return true;
        return intent.quantity <= intent.delegated_limit;
      },
    };
  }

  public evaluateIntent(intent: TradeIntent): PolicyResult {
    console.log(`[PolicyEngine] Evaluating intent...`);

    for (const policy of this.config.policies) {
      const check = this.predicates[policy.condition];
      if (!check) {
        console.warn(`[PolicyEngine] Unknown condition "${policy.condition}" in policy ${policy.id}, skipping.`);
        continue;
      }
      const result = check(intent);

      if (policy.effect === 'deny' && result) {
        return { allowed: false, reason: policy.description || 'Denied by policy', failedPolicyId: policy.id };
      }

      if (policy.effect === 'allow' && !result) {
        return { allowed: false, reason: policy.description || 'Failed allow policy', failedPolicyId: policy.id };
      }
    }

    return { allowed: true };
  }

  /**
   * Persist executed trade into the ledger after successful execution.
   */
  public recordExecution(intent: TradeIntent) {
    this.ledger.recordExecution(intent);
  }
}
