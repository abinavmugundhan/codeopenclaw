import dotenv from 'dotenv';
import path from 'path';

import { FinanceAgent } from './agent';
import { PolicyEngine } from './policy';
import { Executor } from './executor';
import { AuditLogger } from './logger';
import { getOllamaModel } from './config';

const PROJECT_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env') });

const POLICY_FILE = path.resolve(PROJECT_ROOT, 'policy.yaml');

async function main() {
  console.log('=== Starting OpenClaw Finance Agent ===\n');

  const agent = new FinanceAgent();
  const policyEngine = new PolicyEngine(POLICY_FILE);
  const executor = new Executor();
  const logger = new AuditLogger(PROJECT_ROOT);

  console.log(`[Config] Ollama model: ${getOllamaModel()}`);
  console.log(`[Config] Alpaca execution enabled: ${executor.isConfigured() ? 'yes' : 'no'}\n`);

  const scenarios = [
    'safely buy 1 share of AAPL',
    'aggressive buy of 15 shares of MSFT',
    'buy some crypto BTC',
  ];

  for (const scenario of scenarios) {
    const intent = await agent.generateIntent(scenario);
    logger.logIntent({ scenario, intent });

    const evaluation = policyEngine.evaluateIntent(intent);
    logger.logPolicyDecision(intent, evaluation);
    
    if (evaluation.allowed) {
      console.log('[Decision] Policy Engine: Intent ALLOWED');
      try {
        if (!executor.isConfigured()) {
          console.log('[Execution] Skipping Alpaca paper trade because credentials are not configured.');
          logger.logExecution(intent, 'SKIPPED', 'No Alpaca API credentials set in .env');
        } else {
          const receipt = await executor.executeTrade(intent);
          logger.logExecution(intent, 'SUCCESS', { id: receipt.id });
        }
      } catch (err: any) {
        logger.logExecution(intent, 'FAILED', err.message);
      }
    } else {
      console.log(`[Decision] Policy Engine: Intent DENIED. Reason: ${evaluation.reason} (Policy ID: ${evaluation.failedPolicyId})`);
      logger.logExecution(intent, 'BLOCKED_BY_POLICY', evaluation);
    }
  }

  console.log('\n=== Finished Executing Scenarios ===');
  console.log('Check audit.log for detailed execution records.');
}

main().catch(console.error);
