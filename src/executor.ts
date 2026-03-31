import Alpaca from '@alpacahq/alpaca-trade-api';
import { TradeIntent } from './types';
import { hasConfiguredAlpacaCredentials } from './config';

export class Executor {
  private alpaca: any;

  constructor() {
    this.alpaca = new Alpaca({
      keyId: process.env.APCA_API_KEY_ID || 'dummy_key',
      secretKey: process.env.APCA_API_SECRET_KEY || 'dummy_secret',
      paper: true,
    });
  }

  public isConfigured() {
    return hasConfiguredAlpacaCredentials();
  }

  public async executeTrade(intent: TradeIntent) {
    if (!this.isConfigured()) {
      throw new Error('Alpaca paper trading credentials are not configured.');
    }

    console.log(`[Executor] Executing trade: ${intent.action.toUpperCase()} ${intent.quantity} ${intent.symbol}`);
    try {
      // Create the order using Alpaca
      const order = await this.alpaca.createOrder({
        symbol: intent.symbol,
        qty: intent.quantity,
        side: intent.action,
        type: 'market',
        time_in_force: 'gtc',
      });
      console.log(`[Executor] Order executed successfully: ${order.id}`);
      return order;
    } catch (e: any) {
      console.error(`[Executor] Failed to execute trade on Alpaca:`, e.message || e);
      throw e;
    }
  }
}
