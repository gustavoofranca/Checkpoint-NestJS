import { Logger } from '@nestjs/common';

// Security-relevant events (docs/SECURITY.md section 10). Inside a request, nestjs-pino binds the
// request to every log line, so each event carries the request id without passing it around.
// Fields hold ids only: never an email, a username, a password or a token.
export type AuditEvent =
  | 'auth.register'
  | 'auth.login.succeeded'
  | 'auth.login.failed'
  | 'auth.refresh.reuse_detected'
  | 'auth.logout'
  | 'admin.sync.started';

export interface AuditFields {
  userId?: string;
  familyId?: string;
  runId?: string;
}

const logger = new Logger('Audit');

export function recordAudit(event: AuditEvent, fields: AuditFields = {}): void {
  logger.log({ audit: event, ...fields }, event);
}
