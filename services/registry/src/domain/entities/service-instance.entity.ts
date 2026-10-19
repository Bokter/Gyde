/** Names the registry knows about: a local copy, the domain does not import the contracts. */
export type ServiceName =
  'gateway' | 'web' | 'normalization' | 'retrieval' | 'llm-analysis' | 'reports';

export interface InstanceRegistration {
  instanceId: string;
  serviceName: ServiceName;
  baseUrl: string;
  version: string;
  metadata?: Record<string, string>;
}

/** Read-only view of an instance (what leaves the domain; `metadata` stays inside). */
export interface InstanceSnapshot {
  readonly instanceId: string;
  readonly serviceName: ServiceName;
  readonly baseUrl: string;
  readonly version: string;
  readonly healthy: boolean;
  readonly registeredAt: string;
  readonly lastHeartbeatAt: string;
}

export interface ServiceInstanceState extends InstanceRegistration {
  healthy: boolean;
  registeredAt: string;
  lastHeartbeatAt: string;
  failedProbes: number;
}

export class ServiceInstance {
  readonly instanceId: string;
  readonly serviceName: ServiceName;
  readonly baseUrl: string;
  readonly version: string;
  private readonly metadata: Record<string, string>;
  private _healthy: boolean;
  private readonly _registeredAt: string;
  private _lastHeartbeatAt: string;
  private _failedProbes: number;

  private constructor(state: ServiceInstanceState) {
    this.instanceId = state.instanceId;
    this.serviceName = state.serviceName;
    this.baseUrl = state.baseUrl;
    this.version = state.version;
    this.metadata = { ...state.metadata };
    this._healthy = state.healthy;
    this._registeredAt = state.registeredAt;
    this._lastHeartbeatAt = state.lastHeartbeatAt;
    this._failedProbes = state.failedProbes;
  }

  static create(registration: InstanceRegistration, now: Date): ServiceInstance {
    const iso = now.toISOString();
    return new ServiceInstance({
      ...registration,
      healthy: true,
      registeredAt: iso,
      lastHeartbeatAt: iso,
      failedProbes: 0,
    });
  }

  static rehydrate(state: ServiceInstanceState): ServiceInstance {
    return new ServiceInstance(state);
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

  touchHeartbeat(now: Date): void {
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

  isExpired(ttlMs: number, now: number): boolean {
    const last = new Date(this._lastHeartbeatAt).getTime();
    return now - last >= ttlMs;
  }

  snapshot(): InstanceSnapshot {
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
