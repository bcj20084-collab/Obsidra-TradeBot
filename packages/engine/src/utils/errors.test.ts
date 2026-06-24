import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from './errors.js';

describe('AppError', () => {
  it('keeps code and context', () => {
    const error = new AppError(ErrorCode.RISK_BLOCKED, 'blocked', { reason: 'spread' });
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ErrorCode.RISK_BLOCKED);
    expect(error.context.reason).toBe('spread');
  });
});
