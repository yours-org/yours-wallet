export class AgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = 'AgentError';
  }

  toJSON(): Record<string, unknown> {
    return {
      status: 'error',
      code: this.code,
      description: this.message,
      ...this.extra,
    };
  }
}

export function isAgentError(err: unknown): err is AgentError {
  return err instanceof AgentError;
}
