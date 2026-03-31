export function getEnv(name: string, fallback = ''): string {
  return (process.env[name] || fallback).trim();
}

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
