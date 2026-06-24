export type ServiceStatus = 'RUNNING' | 'PAUSED' | 'IDLE';

export interface ServiceConfig {
  minSignalScore: number;
  leverageMax: number;
  dailyLossLimitUsdt: number;
}

class Store {
  status: ServiceStatus = 'RUNNING';
  config: ServiceConfig = {
    minSignalScore: Number(process.env.MIN_SIGNAL_SCORE ?? 65),
    leverageMax: Number(process.env.TRADING_LEVERAGE_MAX ?? 5),
    dailyLossLimitUsdt: Number(process.env.DAILY_LOSS_LIMIT_USDT ?? 50),
  };
  startedAt = Date.now();
  events: { ts: string; type: string; message: string }[] = [];

  setStatus(status: ServiceStatus, message: string) {
    this.status = status;
    this.events.unshift({ ts: new Date().toISOString(), type: status, message });
    this.events = this.events.slice(0, 100);
    return this.snapshot();
  }

  updateConfig(config: Partial<ServiceConfig>) {
    this.config = { ...this.config, ...config };
    this.events.unshift({ ts: new Date().toISOString(), type: 'CONFIG', message: 'Config updated' });
    return this.snapshot();
  }

  snapshot() {
    return {
      status: this.status,
      config: this.config,
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      events: this.events,
    };
  }
}

export const store = new Store();
