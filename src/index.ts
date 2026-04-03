import dotenv from 'dotenv';
import path from 'path';

import { FinanceAgent } from './agent';
import { PolicyEngine } from './policy';
import { Executor } from './executor';
import { AuditLogger } from './logger';
import { TradeLedger } from './ledger';

dotenv.config();

const POLICY_FILE = path.resolve(process.cwd(), 'policy.yaml');

async function main() {
  console.log('=== Starting OpenClaw Finance Agent ===\n');

  const agent = new FinanceAgent();
  const ledger = new TradeLedger();
  const policyEngine = new PolicyEngine(POLICY_FILE, ledger);
  const executor = new Executor();
  const logger = new AuditLogger();

  // Test scenarios simulating LLM inputs
  const scenarios = [
    { text: 'safely buy 1 share of AAPL', actor: 'trader', delegated_limit: 3 },
    { text: 'aggressive buy of 15 shares of MSFT', actor: 'trader' }, // Blocked by per-order limit
    { text: 'buy some crypto BTC', actor: 'trader' },                 // Blocked by symbol/asset class
    { text: 'delegate buy 4 shares of NVDA', actor: 'analyst', delegated_limit: 4 }, // Allowed if under per-order and per-symbol caps
    { text: 'delegate buy 6 shares of NVDA', actor: 'analyst', delegated_limit: 4 }, // Blocked by delegation cap
  ];

  for (const scenario of scenarios) {
    // 1. Agent Reasoning -> Generates Intent Object
    const intent = await agent.generateIntent(typeof scenario === 'string' ? scenario : scenario.text);
    if (typeof scenario !== 'string') {
      intent.actor = scenario.actor;
      intent.delegated_limit = scenario.delegated_limit;
    }
    const intentId = logger.logIntent(typeof scenario === 'string' ? scenario : scenario.text, intent);

    // 2. Policy Engine Evaluation (Deterministic Enforcement)
    const evaluation = policyEngine.evaluateIntent(intent);
    logger.logPolicyDecision(intentId, evaluation);
    
    // 3. Conditional Execution Based on Policy Engine Result
    if (evaluation.decision === 'ALLOW') {
      console.log(`✅ [Decision] Policy Engine: Intent ALLOWED`);
      try {
        // Checking dummy keys to prevent crash if not setup by the user
        if (!process.env.APCA_API_KEY_ID || process.env.APCA_API_KEY_ID === 'dummy_key') {
             console.log('⚠️  Skipping real Alpaca execution because API keys are not set in .env');
             logger.logExecution(intentId, { status: 'SKIPPED', details: 'No Alpaca API Key set in .env' });
        } else {
             const receipt = await executor.executeTrade(intent);
             ledger.recordExecution(intent);
             const orderId = 'order' in receipt ? receipt.order.id : receipt.response.transactionId;
             logger.logExecution(intentId, { status: 'SUCCESS', backend: receipt.source, details: { id: orderId } });
        }
      } catch (err: any) {
        logger.logExecution(intentId, { status: 'FAILED', details: err.message });
      }
    } else {
      console.log(`❌ [Decision] Policy Engine: Intent DENIED. Reason: ${evaluation.failedPolicyId}`);
      logger.logExecution(intentId, { status: 'BLOCKED', details: evaluation });
    }
  }

  console.log('\n=== Finished Executing Scenarios ===');
  console.log('Check audit.log for detailed execution records.');
}

main().catch(console.error);
