function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function switchGuard(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${safeStringify(value)}`);
}
