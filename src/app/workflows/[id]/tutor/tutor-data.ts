import type { WorkMap } from "@/capture/debrief";

export type TutorSessionStart = {
  sessionId: string;
  workMap: WorkMap;
};

export function parseTutorSessionStart(value: unknown): TutorSessionStart | null {
  if (!isRecord(value) || !isRecord(value.session) || !isRecord(value.work_map)) return null;
  if (typeof value.session.id !== "string") return null;
  if (!Array.isArray(value.work_map.steps) || !Array.isArray(value.work_map.rules)) return null;
  return { sessionId: value.session.id, workMap: value.work_map as WorkMap };
}

export function parseTutorRouteError(value: unknown) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  if (!error) return null;
  return {
    code: typeof error.code === "string" ? error.code : null,
    message: typeof error.message === "string" ? error.message : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
