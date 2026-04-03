import fs from 'fs';
import path from 'path';

export class AuditLogger {
  private logFile: string;

  constructor() {
    this.logFile = path.resolve(process.cwd(), 'audit.log');
    // Ensure appending starts with a divider
    fs.appendFileSync(this.logFile, `\n--- Session Start ---\n`, 'utf8');
  }

  public logIntent(data: any) {
    this.writeLog('INTENT_GENERATED', data);
  }

  public logPolicyDecision(intent: any, result: any) {
    this.writeLog('POLICY_EVALUATION', { intent, result });
  }

  public logExecution(intent: any, status: string, details?: any) {
    this.writeLog('EXECUTION_RESULT', { intent, status, details });
  }

  private writeLog(event: string, data: any) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${event}] ${JSON.stringify(data)}\n`;
    fs.appendFileSync(this.logFile, logEntry, 'utf8');
  }
}
