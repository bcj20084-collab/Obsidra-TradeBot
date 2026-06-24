export interface ExposureGuardInput {
  requestedUsdt: number;
  equityUsdt: number;
  maxExposurePct: number;
}

export class ExposureGuard {
  check(input: ExposureGuardInput) {
    const maxAllowed = input.equityUsdt * (input.maxExposurePct / 100);
    if (input.requestedUsdt > maxAllowed) {
      return { ok: false, reason: `Requested exposure ${input.requestedUsdt} exceeds max ${maxAllowed}` };
    }
    return { ok: true, reason: 'ok' };
  }
}
