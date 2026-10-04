import type { DebriefView } from "@/capture/debrief";

export function openQuestionCount(view: DebriefView) {
  if (view.phase === "confirmed") return 0;
  return [...view.ask, ...view.listed].filter(
    (question) => question.status === "queued" || question.status === "asked",
  ).length;
}

/** A built Work Map with no steps and no rules: there is nothing to confirm, and the server refuses it. */
export function hasEmptyMap(view: DebriefView) {
  return Boolean(view.workMap && !view.workMap.steps.length && !view.workMap.rules.length);
}

export function debriefPhaseLabel(view: DebriefView) {
  if (hasEmptyMap(view) && view.phase !== "confirmed") return "Nothing to keep from this session";
  if (view.phase === "preparing") return "Checking the captured moments";
  if (view.phase === "building") return "Building the Work Map";
  if (view.phase === "teach_back") return "Checking what Tiro learned";
  if (view.phase === "confirmed") return "Work Map confirmed";
  if (view.agentSpeaking) return "Tiro is speaking";
  if (view.phase === "asking") return "Tiro is listening";
  return "Ready to start";
}
