import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { AuditEvent, ExecutionRecord, IntentRecord, PolicyEvaluation, TradeIntent, ThreatType } from './types';

export class AuditLogger {
  private jsonLogFile: string;
  private legacyLogFile: string;

  constructor() {
    this.jsonLogFile = path.resolve(process.cwd(), 'audit.jsonl');
    this.legacyLogFile = path.resolve(process.cwd(), 'audit.log');
    if (!fs.existsSync(this.jsonLogFile)) {
      fs.writeFileSync(this.jsonLogFile, '', 'utf8');
    }
    if (!fs.existsSync(this.legacyLogFile)) {
      fs.writeFileSync(this.legacyLogFile, '', 'utf8');
    }
  }

  private append(event: AuditEvent) {
    const line = JSON.stringify(event);
    fs.appendFileSync(this.jsonLogFile, line + '\n', 'utf8');
    // Lightweight legacy line for quick viewing
    fs.appendFileSync(
      this.legacyLogFile,
      `[${event.timestamp}] [${event.type}] ${JSON.stringify(event.payload)}\n`,
      'utf8'
    );
  }

  public logIntent(scenario: string, intent: TradeIntent, intentId?: string): string {
    const id = intentId || randomUUID();
    const record: IntentRecord = {
      id,
      scenario,
      intent,
      createdAt: new Date().toISOString(),
    };
    this.append({
      id: randomUUID(),
      intentId: id,
      type: 'INTENT',
      timestamp: record.createdAt,
      payload: record,
    });
    return id;
  }

  public logPolicyDecision(intentId: string, evaluation: PolicyEvaluation) {
    const failing = evaluation.reasons.find((r) => r.result === 'FAIL');
    this.append({
      id: evaluation.id || randomUUID(),
      intentId,
      type: 'POLICY',
      timestamp: new Date().toISOString(),
      payload: evaluation,
      threat_type: failing?.threat_type,
      decision_reason: failing?.message,
      explanation: failing?.message,
    });
  }

  public logExecution(intentId: string, execution: ExecutionRecord) {
    const threat: ThreatType | undefined =
      execution.status === 'BLOCKED' && execution.details?.reasons
        ? execution.details.reasons.find((r: any) => r.result === 'FAIL')?.threat_type
        : undefined;
    const decisionReason =
      execution.status === 'BLOCKED' && execution.details?.reasons
        ? execution.details.reasons.find((r: any) => r.result === 'FAIL')?.message
        : undefined;

    this.append({
      id: randomUUID(),
      intentId,
      type: 'EXECUTION',
      timestamp: new Date().toISOString(),
      payload: execution,
      threat_type: threat,
      decision_reason: decisionReason,
      explanation: decisionReason,
    });
  }

  public readTimeline(limit = 200): AuditEvent[] {
    try {
      const raw = fs.readFileSync(this.jsonLogFile, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      const events = lines.map((l) => {
        try {
          return JSON.parse(l) as AuditEvent;
        } catch {
          return null;
        }
      }).filter(Boolean) as AuditEvent[];
      return events.slice(-limit);
    } catch {
      return [];
    }
  }

  public latestIntent(): IntentRecord | null {
    const events = this.readTimeline(300).reverse();
    const intentEvt = events.find((e) => e.type === 'INTENT');
    return intentEvt?.payload as IntentRecord || null;
  }

  public findPolicyEvaluation(id: string): PolicyEvaluation | null {
    const events = this.readTimeline(400).reverse();
    const match = events.find((e) => e.type === 'POLICY' && (e.id === id || e.payload?.id === id));
    return (match?.payload as PolicyEvaluation) || null;
  }
}
