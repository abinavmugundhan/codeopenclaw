import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { randomUUID } from 'crypto';
import { TradeIntent, PolicyEvaluation, PolicyConfig, PolicyReason } from './types';
import { TradeLedger } from './ledger';

type PolicyPredicate = (intent: TradeIntent) => boolean;

export class PolicyEngine {
  private config: PolicyConfig;
  private ledger: TradeLedger;
  private predicates: Record<string, PolicyPredicate>;
  private nowOverride?: Date;

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
        allowed_actions: ['buy', 'sell', 'analyze', 'status'],
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
        if (!this.nowOverride && process.env.DEMO_ASSUME_MARKET_HOURS === 'true') return true;
        const now = this.nowOverride ?? new Date();
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

  private buildReason(policyId: string, effect: 'allow' | 'deny', passed: boolean, intent: TradeIntent): PolicyReason {
    const defaultMsg = passed ? 'Passed policy' : 'Failed policy';
    const messages: Record<string, string> = {
      per_order_limit: passed
        ? 'Within per-order max quantity'
        : `Order size exceeds per-order max`,
      daily_limit: passed
        ? 'Within daily aggregate limit'
        : 'Would breach daily aggregate limit',
      per_symbol_daily_limit: passed
        ? 'Within per-symbol daily limit'
        : 'Would breach per-symbol daily limit',
      market_hours: passed
        ? 'Within market hours'
        : 'Outside market hours',
      symbol_allowed: passed
        ? 'Symbol is approved'
        : 'Symbol not in allowlist',
      asset_class_allowed: passed
        ? 'Asset class is allowed'
        : 'Asset class not allowed',
      actor_allowed: passed
        ? 'Actor is allowed'
        : 'Actor not allowed',
      delegation_limit: passed
        ? 'Within delegated limit'
        : 'Exceeds delegated limit',
      blackout_window: passed
        ? 'Not in blackout window'
        : 'Inside blackout window',
    };
    return {
      rule: policyId,
      result: passed ? 'PASS' : 'FAIL',
      message: messages[policyId] ?? defaultMsg,
      effect,
    };
  }

  public evaluateIntent(intent: TradeIntent, opts?: { now?: Date }): PolicyEvaluation {
    console.log(`[PolicyEngine] Evaluating intent...`);
    this.nowOverride = opts?.now;
    const reasons: PolicyReason[] = [];
    let failedPolicyId: string | undefined;
    for (const policy of this.config.policies) {
      const check = this.predicates[policy.condition];
      if (!check) {
        console.warn(`[PolicyEngine] Unknown condition "${policy.condition}" in policy ${policy.id}, skipping.`);
        continue;
      }
      const result = check(intent);

      const passed = policy.effect === 'allow' ? result : !result;
      reasons.push(this.buildReason(policy.id, policy.effect, passed, intent));

      if (!passed && !failedPolicyId) {
        failedPolicyId = policy.id;
      }
    }

    const allowed = !failedPolicyId;
    this.nowOverride = undefined;
    return {
      id: randomUUID(),
      decision: allowed ? 'ALLOW' : 'DENY',
      reasons,
      failedPolicyId,
      allowed,
    };
  }

  /**
   * Persist executed trade into the ledger after successful execution.
   */
  public recordExecution(intent: TradeIntent) {
    this.ledger.recordExecution(intent);
  }
}
