import "server-only";

export type SoftError = {
  code: "timeout" | "error";
  service: string;
  message: string;
};

export type SoftResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SoftError };

/**
 * Runs one external call so that a timeout or failure comes back as a value.
 * Every call that leaves the app (database, voice, models, research) goes
 * through here: an outage must degrade a session, never break it.
 *
 * The signal is aborted when the timeout fires. The result is returned at the
 * timeout even if the call ignores the signal.
 */
export async function failSoft<T>(
  service: string,
  call: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number },
): Promise<SoftResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timedOut = new Promise<SoftResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        ok: false,
        error: {
          code: "timeout",
          service,
          message: `${service} did not answer within ${options.timeoutMs} ms`,
        },
      });
    }, options.timeoutMs);
  });

  const attempt = (async (): Promise<SoftResult<T>> => {
    try {
      return { ok: true, value: await call(controller.signal) };
    } catch (cause) {
      return {
        ok: false,
        error: { code: "error", service, message: describe(cause) },
      };
    }
  })();

  try {
    return await Promise.race([attempt, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === "string" && cause) return cause;
  return "unknown error";
}
