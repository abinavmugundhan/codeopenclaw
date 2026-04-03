import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

import { FinanceAgent } from './agent';
import { PolicyEngine } from './policy';
import { Executor } from './executor';
import { AuditLogger } from './logger';
import { TradeLedger } from './ledger';
import { AuditEvent, ExecutionRecord, IntentRecord, PolicyEvaluation, TradeIntent, SecurityStatus, ThreatType } from './types';

dotenv.config();
// Demo-friendly default: assume market hours unless explicitly disabled
if (process.env.DEMO_ASSUME_MARKET_HOURS === undefined) {
  process.env.DEMO_ASSUME_MARKET_HOURS = 'true';
}

const app = express();
const PORT = Number(process.env.API_PORT || 4789);
const repoRoot = path.resolve(__dirname, '..');
const dashboardDist = path.resolve(repoRoot, 'dashboard', 'dist');

// Initialize components
const agent = new FinanceAgent();
const ledger = new TradeLedger();
const policyEngine = new PolicyEngine(path.resolve(repoRoot, 'policy.yaml'), ledger);
const executor = new Executor();
const logger = new AuditLogger();

type ScenarioPreset = 'valid' | 'oversized' | 'restricted' | 'afterhours';

const presets: Record<ScenarioPreset, { scenario: string; actor?: string; delegated_limit?: number; simulateAfterHours?: boolean }> = {
  valid: { scenario: 'buy 1 share of AAPL', actor: 'trader' },
  oversized: { scenario: 'buy 15 shares of MSFT', actor: 'trader' },
  restricted: { scenario: 'buy 1 share of BTC', actor: 'trader' },
  afterhours: { scenario: 'buy 1 share of AAPL right now', actor: 'trader', simulateAfterHours: true },
};

type ScenarioResult = {
  intentId: string;
  intent: TradeIntent;
  evaluation: PolicyEvaluation;
  execution: ExecutionRecord | null;
};

const parseJsonFile = (file: string, fallback: any) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

function summarizeSecurity(events: AuditEvent[]): SecurityStatus {
  const status: SecurityStatus = {
    total_allowed: 0,
    total_blocked: 0,
    violations_by_type: {
      RISK_LIMIT: 0,
      TIME_VIOLATION: 0,
      UNAUTHORIZED_ASSET: 0,
      POLICY_BREACH: 0,
    },
    enforced: true,
  };
  for (const evt of events) {
    if (evt.type === 'POLICY') {
      const decision = evt.payload?.decision;
      if (decision === 'ALLOW') status.total_allowed += 1;
      if (decision === 'DENY') status.total_blocked += 1;
      const reasons: any[] = evt.payload?.reasons || [];
      const failing = reasons.filter((r) => r.result === 'FAIL');
      for (const r of failing) {
        const t = (r.threat_type || 'POLICY_BREACH') as ThreatType;
        status.violations_by_type[t] = (status.violations_by_type[t] || 0) + 1;
      }
    }
    if (evt.type === 'EXECUTION' && evt.payload?.status === 'BLOCKED' && evt.threat_type) {
      status.violations_by_type[evt.threat_type] = (status.violations_by_type[evt.threat_type] || 0) + 1;
      status.total_blocked += 1;
    }
  }
  return status;
}

async function processScenario(options: {
  scenario: string;
  execute?: boolean;
  actor?: string;
  delegated_limit?: number;
  simulateAfterHours?: boolean;
}): Promise<ScenarioResult> {
  const intent = await agent.generateIntent(options.scenario);
  if (options.actor) intent.actor = options.actor;
  if (options.delegated_limit !== undefined) intent.delegated_limit = options.delegated_limit;

  const intentId = logger.logIntent(options.scenario, intent);
  const nowOverride = options.simulateAfterHours ? new Date(Date.UTC(2024, 0, 1, 1, 0, 0)) : undefined;
  const evaluation = policyEngine.evaluateIntent(intent, nowOverride ? { now: nowOverride } : undefined);
  logger.logPolicyDecision(intentId, evaluation);

  let execution: ExecutionRecord | null = null;
  if (evaluation.decision === 'ALLOW' && options.execute) {
    if (!executor.isConfigured()) {
      execution = { status: 'SKIPPED', details: 'Alpaca not configured' };
    } else {
      try {
        const receipt = await executor.executeTrade(intent, false);
        ledger.recordExecution(intent);
        execution = { status: 'SUCCESS', backend: receipt.source, details: receipt };
      } catch (err: any) {
        execution = { status: 'FAILED', details: err.message };
      }
    }
  } else if (evaluation.decision !== 'ALLOW') {
    execution = { status: 'BLOCKED', details: evaluation };
  }

  if (execution) {
    logger.logExecution(intentId, execution);
  }

  return { intentId, intent, evaluation, execution };
}

// Middleware
app.use(cors());
app.use(express.json());

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Latest intent
app.get('/api/intent/latest', (_req, res) => {
  const latest = logger.latestIntent();
  res.json({ intent: latest });
});

// Policy evaluation by id
app.get('/api/policy/evaluation/:id', (req, res) => {
  const evaln = logger.findPolicyEvaluation(req.params.id);
  if (!evaln) return res.status(404).json({ error: 'not found' });
  res.json(evaln);
});

// Policy config (yaml -> json)
app.get('/api/policy/json', (_req, res) => {
  try {
    const policyContent = fs.readFileSync(path.resolve(repoRoot, 'policy.yaml'), 'utf8');
    const parsed = yaml.load(policyContent);
    res.json(parsed);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Ledger status
app.get('/api/ledger/status', (_req, res) => {
  const snap = ledger.getToday();
  res.json(snap);
});
app.get('/api/ledger', (_req, res) => {
  const snap = ledger.getToday();
  res.json(snap);
});

// Audit timeline (structured)
app.get('/api/audit/timeline', (req, res) => {
  const limit = Number(req.query.limit || 200);
  const events = logger.readTimeline(limit);
  res.json({ events });
});

// Security status
app.get('/api/security/status', (req, res) => {
  const limit = Number(req.query.limit || 400);
  const events = logger.readTimeline(limit);
  const summary = summarizeSecurity(events);
  res.json(summary);
});

// Legacy audit (returns text lines derived from JSON)
app.get('/api/audit', (req, res) => {
  const limit = Number(req.query.limit || 200);
  const events = logger.readTimeline(limit);
  const entries = events.map((e) => `[${e.timestamp}] [${e.type}] ${JSON.stringify(e.payload)}`);
  res.json({ entries });
});

// Simulation endpoint (no live execution)
app.post('/api/simulate/scenario', async (req, res) => {
  try {
    const preset: ScenarioPreset | undefined = req.body.preset;
    const scenario: string = req.body.scenario || (preset ? presets[preset].scenario : '');
    if (!scenario) {
      return res.status(400).json({ error: 'scenario or preset required' });
    }
    const presetCfg = preset ? presets[preset] : undefined;
    const result = await processScenario({
      scenario,
      execute: false,
      actor: presetCfg?.actor,
      delegated_limit: presetCfg?.delegated_limit,
      simulateAfterHours: presetCfg?.simulateAfterHours,
    });
    res.json({ ...result, preset });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Execute scenario (optional live trade)
app.post('/api/intent/run', async (req, res) => {
  try {
    const scenario: string = req.body.scenario;
    const execute: boolean = !!req.body.execute;
    if (!scenario) return res.status(400).json({ error: 'scenario required' });
    const result = await processScenario({ scenario, execute });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Portfolio mock (keep lightweight for demo)
app.get('/api/portfolio', (_req, res) => {
  res.json({
    cash: 10000,
    portfolio_value: 15000,
    positions: [
      { symbol: 'AAPL', qty: 2, market_value: 350 },
      { symbol: 'MSFT', qty: 1, market_value: 380 },
    ],
  });
});

// Atomic Bot Balance (optional)
app.get('/api/atomic-balance', async (_req, res) => {
  try {
    if (executor.atomicBot.isConfigured()) {
      const balance = await executor.getAtomicBotBalance();
      res.json(balance);
    } else {
      res.json({ error: 'Atomic Bot not configured', success: false });
    }
  } catch (error: any) {
    res.json({ error: error.message, success: false });
  }
});

// Atomic Bot History (optional)
app.get('/api/atomic-history', async (_req, res) => {
  try {
    if (executor.atomicBot.isConfigured()) {
      const history = await executor.getAtomicBotHistory();
      res.json(history);
    } else {
      res.json({ error: 'Atomic Bot not configured', success: false });
    }
  } catch (error: any) {
    res.json({ error: error.message, success: false });
  }
});

if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 OpenClaw API Server running on http://localhost:${PORT}`);
  if (fs.existsSync(dashboardDist)) {
    console.log(`📊 Dashboard available at: http://localhost:${PORT}`);
  } else {
    console.log(`📊 Dashboard dev server expected at: http://localhost:4173`);
  }
});
