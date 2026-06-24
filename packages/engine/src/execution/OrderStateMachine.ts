import { AppError, ErrorCode } from '../utils/errors.js';

export type OrderState = 'PENDING' | 'SUBMITTED' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CLOSING' | 'CLOSED' | 'CANCELLED' | 'ERROR';
const allowed: Record<OrderState, OrderState[]> = { PENDING: ['SUBMITTED', 'CANCELLED', 'ERROR'], SUBMITTED: ['OPEN', 'PARTIALLY_FILLED', 'CANCELLED', 'ERROR'], OPEN: ['FILLED', 'CLOSING', 'ERROR'], PARTIALLY_FILLED: ['FILLED', 'CANCELLED', 'ERROR'], FILLED: ['CLOSING', 'CLOSED', 'ERROR'], CLOSING: ['CLOSED', 'ERROR'], CLOSED: [], CANCELLED: [], ERROR: [] };

export class OrderStateMachine {
  transition(current: OrderState, next: OrderState) {
    if (!allowed[current].includes(next)) throw new AppError(ErrorCode.STATE_TRANSITION_INVALID, `Invalid transition ${current} -> ${next}`);
    return next;
  }
}
