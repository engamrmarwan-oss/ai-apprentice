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

export type TutorLanguage = {
  code: string;
  name: string;
  ownName: string;
};

export const ENGLISH = "en";

/** The languages on offer, English first and the rest by the name a speaker of each would read. */
export function parseLanguages(value: unknown): TutorLanguage[] | null {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.languages)) return null;
  const languages: TutorLanguage[] = [];
  for (const language of value.languages) {
    if (
      !isRecord(language) ||
      typeof language.code !== "string" ||
      typeof language.name !== "string" ||
      typeof language.own_name !== "string"
    ) {
      return null;
    }
    languages.push({ code: language.code, name: language.name, ownName: language.own_name });
  }
  return languages.sort((a, b) =>
    a.code === ENGLISH ? -1 : b.code === ENGLISH ? 1 : a.ownName.localeCompare(b.ownName),
  );
}

export function parseTutorRouteError(value: unknown) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  if (!error) return null;
  const fields = isRecord(error.fields) ? error.fields : {};
  return {
    code: typeof error.code === "string" ? error.code : null,
    languageField: typeof fields.language === "string" ? fields.language : null,
    message: typeof error.message === "string" ? error.message : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
