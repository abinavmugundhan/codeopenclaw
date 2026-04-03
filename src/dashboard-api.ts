import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import yaml from 'js-yaml';
import Alpaca from '@alpacahq/alpaca-trade-api';

const app = express();
app.use(cors());
app.use(express.json());

const POLICY_FILE = path.resolve(process.cwd(), 'policy.yaml');
const LEDGER_FILE = path.resolve(process.cwd(), 'state', 'trade-ledger.json');
const AUDIT_FILE = path.resolve(process.cwd(), 'audit.log');

function safeReadJSON(file: string, fallback: any) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/policy', (_req, res) => {
  try {
    const yaml = fs.readFileSync(POLICY_FILE, 'utf8');
    res.type('text/plain').send(yaml);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/policy/json', (_req, res) => {
  try {
    const text = fs.readFileSync(POLICY_FILE, 'utf8');
    const parsed = yaml.load(text);
    res.json(parsed);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ledger', (_req, res) => {
  const data = safeReadJSON(LEDGER_FILE, { date: null, totalQuantity: 0, perSymbol: {} });
  res.json(data);
});

app.get('/api/audit', (req, res) => {
  const limit = Number(req.query.limit || 200);
  try {
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
    const lines = raw.trim().split('\n');
    res.json({ entries: lines.slice(-limit) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/market-hours', (req, res) => {
  const enable = req.body.enable; // true to enforce, false to disable
  try {
    const yaml = fs.readFileSync(POLICY_FILE, 'utf8');
    const updated = yaml.replace(/market_hours_only:\s*(true|false)/, `market_hours_only: ${enable ? 'true' : 'false'}`);
    fs.writeFileSync(POLICY_FILE, updated, 'utf8');
    res.json({ ok: true, market_hours_only: !!enable });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Optional Alpaca balance endpoint
app.get('/api/alpaca/balance', async (_req, res) => {
  try {
    const alpaca = new Alpaca({
      keyId: process.env.APCA_API_KEY_ID,
      secretKey: process.env.APCA_API_SECRET_KEY,
      paper: true,
      baseUrl: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets',
    });
    const account = await alpaca.getAccount();
    res.json(account);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Alpaca error' });
  }
});

app.get('/api/alpaca/history', async (_req, res) => {
  try {
    const alpaca = new Alpaca({
      keyId: process.env.APCA_API_KEY_ID,
      secretKey: process.env.APCA_API_SECRET_KEY,
      paper: true,
      baseUrl: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets',
    });
    const positions = await alpaca.getPositions();
    res.json({ positions });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Alpaca error' });
  }
});

app.get('/api/portfolio', async (_req, res) => {
  try {
    const alpaca = new Alpaca({
      keyId: process.env.APCA_API_KEY_ID,
      secretKey: process.env.APCA_API_SECRET_KEY,
      paper: true,
      baseUrl: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets',
    });
    const [account, positions] = await Promise.all([alpaca.getAccount(), alpaca.getPositions()]);
    res.json({ balance: account, positions });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Alpaca error' });
  }
});

const PORT = process.env.DASHBOARD_API_PORT ? Number(process.env.DASHBOARD_API_PORT) : 4789;
app.listen(PORT, () => {
  console.log(`Dashboard API listening on http://localhost:${PORT}`);
});
