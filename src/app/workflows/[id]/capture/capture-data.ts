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

/** What to say where the start button is when a session could not be started. */
export function startProblem(
  status: number,
  error: { code: string | null; message: string | null } | null,
  fallback: string,
) {
  if (error?.code === "daily_limit" || status === 429) {
    return {
      limit: true,
      message: error?.message ?? "You have started as many sessions as you can today. Try again tomorrow.",
    };
  }
  return { limit: false, message: error?.message ?? fallback };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
