// Narrow runtime adapter: upstream handlers/options remain the source of truth.
export function defineCommand<T>(command: T): T { return command; }
export function option<T>(schema: T, config: object = {}) { return { schema, ...config }; }
