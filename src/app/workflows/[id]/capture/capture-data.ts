export function parseSessionId(value: unknown): string | null {
  return isRecord(value) &&
    value.ok === true &&
    isRecord(value.session) &&
    typeof value.session.id === "string"
    ? value.session.id
    : null;
}

export function parseRouteError(value: unknown): { code: string; message: string } | null {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) return null;
  return typeof value.error.code === "string" && typeof value.error.message === "string"
    ? { code: value.error.code, message: value.error.message }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
