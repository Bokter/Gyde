import type { InstanceInfo, ServiceName, ServiceRegistration } from '@gyde/contracts';

export interface ServiceInstanceData {
  instanceId: string;
  serviceName: ServiceName;
  baseUrl: string;
  version: string;
  metadata?: Record<string, string>;
  healthy?: boolean;
  registeredAt?: string;
  lastHeartbeatAt?: string;
  failedProbes?: number;
}

export class ServiceInstance {
  readonly instanceId: string;
  readonly serviceName: ServiceName;
  readonly baseUrl: string;
  readonly version: string;
  readonly metadata: Record<string, string>;
  private _healthy: boolean;
  private _registeredAt: string;
  private _lastHeartbeatAt: string;
  private _failedProbes: number;

  constructor(data: ServiceInstanceData) {
    this.instanceId = data.instanceId;
    this.serviceName = data.serviceName;
    this.baseUrl = data.baseUrl;
    this.version = data.version;
    this.metadata = data.metadata ?? {};
    this._healthy = data.healthy ?? true;
    this._registeredAt = data.registeredAt ?? new Date().toISOString();
    this._lastHeartbeatAt = data.lastHeartbeatAt ?? new Date().toISOString();
    this._failedProbes = data.failedProbes ?? 0;
  }

  static fromRegistration(reg: ServiceRegistration, now = new Date()): ServiceInstance {
    const iso = now.toISOString();
    return new ServiceInstance({
      instanceId: reg.instanceId,
      serviceName: reg.serviceName,
      baseUrl: reg.baseUrl,
      version: reg.version,
      metadata: reg.metadata,
      healthy: true,
      registeredAt: iso,
      lastHeartbeatAt: iso,
      failedProbes: 0,
    });
  }

  get healthy(): boolean {
    return this._healthy;
  }

  get registeredAt(): string {
    return this._registeredAt;
  }

  get lastHeartbeatAt(): string {
    return this._lastHeartbeatAt;
  }

  get failedProbes(): number {
    return this._failedProbes;
  }

  touchHeartbeat(now = new Date()): void {
    this._lastHeartbeatAt = now.toISOString();
    this._healthy = true;
    this._failedProbes = 0;
  }

  recordProbeSuccess(): void {
    this._failedProbes = 0;
    this._healthy = true;
  }

  recordProbeFailure(): void {
    this._failedProbes++;
    this._healthy = false;
  }

  isExpired(ttlMs: number, now = Date.now()): boolean {
    const last = new Date(this._lastHeartbeatAt).getTime();
    return now - last >= ttlMs;
  }

  toContract(): InstanceInfo {
    return {
      instanceId: this.instanceId,
      serviceName: this.serviceName,
      baseUrl: this.baseUrl,
      version: this.version,
      healthy: this._healthy,
      registeredAt: this._registeredAt,
      lastHeartbeatAt: this._lastHeartbeatAt,
    };
  }
}
