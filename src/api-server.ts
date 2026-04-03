import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { FinanceAgent } from './agent';
import { PolicyEngine } from './policy';
import { Executor } from './executor';
import { AuditLogger } from './logger';
import { TradeLedger } from './ledger';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = 4789;

// Initialize components
const agent = new FinanceAgent();
const ledger = new TradeLedger();
const policyEngine = new PolicyEngine(path.resolve(process.cwd(), 'policy.yaml'), ledger);
const executor = new Executor();
const logger = new AuditLogger();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes

// Audit logs
app.get('/api/audit', (req, res) => {
  try {
    const logs = fs.readFileSync(path.resolve(process.cwd(), 'audit.log'), 'utf8');
    const entries = logs.split('\n').filter(line => line.trim());
    res.json({ entries });
  } catch (error) {
    res.json({ entries: [] });
  }
});

// Policy configuration
app.get('/api/policy/json', (req, res) => {
  try {
    const policyContent = fs.readFileSync(path.resolve(process.cwd(), 'policy.yaml'), 'utf8');
    // Simple YAML parsing for demo
    const policies = {
      limits: {
        per_order_max_qty: 5,
        daily_max_qty: 20,
        per_symbol_daily_max_qty: 10,
        market_hours_only: false,
        approved_symbols: ['AAPL', 'MSFT', 'TSLA'],
        allowed_asset_classes: ['equity'],
        allowed_actors: ['user', 'agent']
      },
      policies: [
        { id: 'allowed_asset_classes', condition: "intent.asset_class == 'equity'", effect: 'allow' },
        { id: 'max_quantity', condition: 'intent.quantity <= 5', effect: 'allow' },
        { id: 'block_oversize', condition: 'intent.quantity > 5', effect: 'deny' }
      ]
    };
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load policy' });
  }
});

// Ledger (mock data)
app.get('/api/ledger', (req, res) => {
  res.json({
    date: new Date().toISOString().split('T')[0],
    totalQuantity: 3,
    perSymbol: {
      'AAPL': 2,
      'MSFT': 1
    }
  });
});

// Portfolio (mock Alpaca data)
app.get('/api/portfolio', (req, res) => {
  res.json({
    cash: 10000,
    portfolio_value: 15000,
    positions: [
      { symbol: 'AAPL', qty: 2, market_value: 350 },
      { symbol: 'MSFT', qty: 1, market_value: 380 }
    ]
  });
});

// Atomic Bot Balance
app.get('/api/atomic-balance', async (req, res) => {
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

// Atomic Bot History
app.get('/api/atomic-history', async (req, res) => {
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

// Direct LLM-to-Atomic Bot API
app.post('/api/llm-to-atomic', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await agent.executeWithAtomicBot(prompt);
    logger.logIntent({ scenario: prompt, intent: result.llmRequest });
    logger.logExecution(result.llmRequest, result.apiResponse.success ? 'SUCCESS' : 'FAILED', result.apiResponse);
    
    res.json(result);
  } catch (error: any) {
    console.error('LLM-to-Atomic Bot error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Market hours toggle
app.post('/api/market-hours', (req, res) => {
  res.json({ success: true, message: 'Market hours toggled' });
});

app.listen(PORT, () => {
  console.log(`🚀 OpenClaw API Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard available at: http://localhost:4173`);
});
