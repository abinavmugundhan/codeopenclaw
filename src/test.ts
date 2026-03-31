import assert from 'assert';
import path from 'path';

import { parseIntentHeuristically } from './parser';
import { PolicyEngine } from './policy';

const policyEngine = new PolicyEngine(path.resolve(__dirname, '..', 'policy.yaml'));

function testParser() {
  assert.deepStrictEqual(parseIntentHeuristically('safely buy 3 shares of TSLA'), {
    action: 'buy',
    symbol: 'TSLA',
    quantity: 3,
    asset_class: 'equity',
  });

  assert.deepStrictEqual(parseIntentHeuristically('sell 2 shares of MSFT'), {
    action: 'sell',
    symbol: 'MSFT',
    quantity: 2,
    asset_class: 'equity',
  });

  assert.deepStrictEqual(parseIntentHeuristically('buy crypto BTC now'), {
    action: 'buy',
    symbol: 'BTC',
    quantity: 1,
    asset_class: 'crypto',
  });
}

function testPolicies() {
  const allowed = policyEngine.evaluateIntent({
    action: 'buy',
    symbol: 'AAPL',
    quantity: 1,
    asset_class: 'equity',
  });
  assert.strictEqual(allowed.allowed, true);

  const blockedQuantity = policyEngine.evaluateIntent({
    action: 'buy',
    symbol: 'MSFT',
    quantity: 10,
    asset_class: 'equity',
  });
  assert.strictEqual(blockedQuantity.allowed, false);
  assert.strictEqual(blockedQuantity.failedPolicyId, 'max_quantity');

  const blockedCrypto = policyEngine.evaluateIntent({
    action: 'buy',
    symbol: 'BTC',
    quantity: 1,
    asset_class: 'crypto',
  });
  assert.strictEqual(blockedCrypto.allowed, false);
  assert.strictEqual(blockedCrypto.failedPolicyId, 'allowed_asset_classes');
}

function main() {
  testParser();
  testPolicies();
  console.log('All tests passed.');
}

main();
