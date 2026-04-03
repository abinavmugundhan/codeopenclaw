export function getEnv(name: string, fallback = ''): string {
  return (process.env[name] || fallback).trim();
}

export type LlmProvider = 'ollama' | 'openai' | 'anthropic' | 'openrouter';

export function hasConfiguredAlpacaCredentials(): boolean {
  const keyId = getEnv('APCA_API_KEY_ID');
  const secretKey = getEnv('APCA_API_SECRET_KEY');

  const placeholders = new Set([
    '',
    'YOUR_PAPER_KEY',
    'YOUR_PAPER_SECRET',
    'dummy_key',
    'dummy_secret',
    'your_alpaca_key_here',
    'your_alpaca_secret_here',
  ]);

  return !placeholders.has(keyId) && !placeholders.has(secretKey);
}

export function getOllamaModel(): string {
  return getEnv('OLLAMA_MODEL', 'llama3');
}

export function getLlmProvider(): LlmProvider {
  const configured = getEnv('LLM_PROVIDER').toLowerCase();

  if (configured === 'openai' || configured === 'anthropic' || configured === 'openrouter' || configured === 'ollama') {
    return configured;
  }

  if (getEnv('OPENROUTER_API_KEY')) return 'openrouter';
  if (getEnv('OPENAI_API_KEY')) return 'openai';
  if (getEnv('ANTHROPIC_API_KEY')) return 'anthropic';
  return 'ollama';
}

export function getLlmModel(provider: LlmProvider = getLlmProvider()): string {
  if (provider === 'openrouter') {
    return getEnv('OPENROUTER_MODEL', 'qwen/qwen3.6-plus:free');
  }
  if (provider === 'openai') {
    return getEnv('OPENAI_MODEL', 'gpt-4o-mini');
  }
  if (provider === 'anthropic') {
    return getEnv('ANTHROPIC_MODEL', 'claude-3-5-sonnet-latest');
  }
  return getOllamaModel();
}

export function getOllamaBaseUrl(): string {
  return getEnv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434/api/generate');
}

export function getLlmApiKey(provider: LlmProvider = getLlmProvider()): string {
  if (provider === 'openrouter') return getEnv('OPENROUTER_API_KEY');
  if (provider === 'openai') return getEnv('OPENAI_API_KEY');
  if (provider === 'anthropic') return getEnv('ANTHROPIC_API_KEY');
  return '';
}

export function getAtomicBotApiKey(): string {
  return getEnv('ARMORIQ_API_KEY', getEnv('ATOMIC_BOT_API_KEY'));
}

export function getAtomicBotBaseUrl(): string {
  return getEnv('ARMORIQ_BASE_URL', getEnv('ATOMIC_BOT_BASE_URL', 'https://api.atomicbot.com/v1'));
}
