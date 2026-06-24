export enum ErrorCode {
  ENV_INVALID = 'ENV_INVALID',
  BYBIT_HTTP_ERROR = 'BYBIT_HTTP_ERROR',
  BYBIT_WS_ERROR = 'BYBIT_WS_ERROR',
  RISK_BLOCKED = 'RISK_BLOCKED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  STATE_TRANSITION_INVALID = 'STATE_TRANSITION_INVALID',
  DB_WRITE_FAILED = 'DB_WRITE_FAILED',
}

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
  }
}
