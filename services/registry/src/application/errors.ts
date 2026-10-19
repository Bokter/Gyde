/** Base of every registry application error: carries a stable `code`, never an HTTP status. */
export class RegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InstanceNotFoundError extends RegistryError {
  constructor(instanceId: string) {
    super('instance_not_found', `Instance "${instanceId}" is not registered`);
  }
}
