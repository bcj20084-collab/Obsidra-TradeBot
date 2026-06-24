export enum ErrorCode {
  CONFIG_INVALID = "CONFIG_INVALID",
  EXCHANGE_TEMPORARY = "EXCHANGE_TEMPORARY",
  EXCHANGE_PERMANENT = "EXCHANGE_PERMANENT",
  RATE_LIMITED = "RATE_LIMITED",
  RISK_REJECTED = "RISK_REJECTED",
  INVALID_TRANSITION = "INVALID_TRANSITION",
  DATABASE_ERROR = "DATABASE_ERROR",
  AUTH_FAILED = "AUTH_FAILED",
  CIRCUIT_BREAKER = "CIRCUIT_BREAKER",
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
