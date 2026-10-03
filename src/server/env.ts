import "server-only";

/** Reads a server environment variable. Empty or whitespace counts as not set. */
export function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
