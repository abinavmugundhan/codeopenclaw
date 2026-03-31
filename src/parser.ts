import { TradeIntent } from './types';

const ACTION_STOP_WORDS = new Set([
  'BUY',
  'SELL',
  'JSON',
  'API',
  'LLM',
  'SHARE',
  'SHARES',
  'STOCK',
  'STOCKS',
  'OF',
  'SOME',
  'SAFE',
  'SAFELY',
  'NOW',
  'CRYPTO',
]);

function extractAction(prompt: string): TradeIntent['action'] {
  return prompt.toLowerCase().includes('sell') ? 'sell' : 'buy';
}

function extractQuantity(prompt: string): number {
  const quantityMatch = prompt.match(/(\d+)\s*(share|shares|stock|stocks|unit|units|qty)?/i);
  return quantityMatch ? Number.parseInt(quantityMatch[1], 10) : 1;
}

function extractSymbol(prompt: string): string {
  const actionPattern = /\b(?:buy|sell)\b(?:\s+\d+)?(?:\s+shares?)?(?:\s+of)?\s+([A-Za-z]{1,5})\b/i;
  const actionMatch = prompt.match(actionPattern);
  if (actionMatch) {
    const candidate = actionMatch[1].toUpperCase();
    if (!ACTION_STOP_WORDS.has(candidate)) {
      return candidate;
    }
  }

  const upperTokens = prompt.toUpperCase().match(/\b[A-Z]{2,5}\b/g) || [];
  const symbol = upperTokens.find((token) => !ACTION_STOP_WORDS.has(token));
  return symbol || 'AAPL';
}

function extractAssetClass(prompt: string): string {
  const normalized = prompt.toLowerCase();
  if (normalized.includes('crypto') || normalized.includes('btc') || normalized.includes('eth')) {
    return 'crypto';
  }
  return 'equity';
}

export function parseIntentHeuristically(prompt: string): TradeIntent {
  return {
    action: extractAction(prompt),
    symbol: extractSymbol(prompt),
    quantity: extractQuantity(prompt),
    asset_class: extractAssetClass(prompt),
  };
}
