export class WineCellarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WineCellarValidationError";
  }
}

export class WineCellarPersistenceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "WineCellarPersistenceError";
    this.cause = options?.cause;
  }
}
