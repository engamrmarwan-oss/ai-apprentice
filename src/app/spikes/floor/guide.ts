// Spike S2: decides what the person should do next, from the log so far, so
// the page can show one step at a time instead of a list to work through.
import { summarize, type Entry } from "./summary";

export type Step = {
  /** What to do now. */
  title: string;
  /** A sentence to read aloud, when the step is to speak. */
  say?: string;
  detail?: string;
  /** True once every step of the run has been done. */
  done: boolean;
};

export const SENTENCES_NEEDED = 3;
export const UPDATES_NEEDED = 5;
export const QUESTIONS_NEEDED = 3;

export type RunState = "idle" | "starting" | "running" | "stopped";

/** The step the run is at. `sentences` are read aloud in order; the first one is reused at the end. */
export function nextStep(state: RunState, floorOpen: boolean, entries: Entry[], sentences: string[]): Step {
  const summary = summarize(entries);
  const step = (title: string, extra: Partial<Step> = {}): Step => ({ title, done: false, ...extra });
  const waitForLog = "Then wait until it appears in the log below.";

  if (state === "starting") return step("Connecting. Allow the microphone if Chrome asks.");
  if (state === "idle") return step("Press Start and allow the microphone.");

  const heard = summary.closedFloor.scribeCommitted;
  const updates = summary.contextUpdates.sent;
  const asked = summary.triggers.sent;
  const lastClose = entries.findLast((entry) => entry.kind === "floor" && !entry.open)?.t ?? Infinity;
  const saidAfterwards = entries.some((entry) => entry.kind === "scribe_committed" && entry.startedAt > lastClose);
  const complete =
    heard >= SENTENCES_NEEDED && updates >= UPDATES_NEEDED && asked >= QUESTIONS_NEEDED && !floorOpen && saidAfterwards;

  if (state === "stopped") {
    return complete
      ? step("Press Download results.", { done: true })
      : step("Press Download results. This run stopped before the last step, so some checks have nothing to score.");
  }

  if (!entries.some((entry) => entry.kind === "status" && entry.status === "agent connected")) {
    return step("Waiting for Tiro to connect.");
  }
  if (floorOpen) {
    return step("Tiro is asking. Answer aloud in a sentence or two.", {
      detail:
        "If it asks a follow-up, answer that too. The floor should close by itself. If it has not closed 30 seconds after your last answer, press Close the floor.",
    });
  }
  // Before the first update, only the sentences count. Later speech is the answers and the closing sentence.
  if (updates === 0 && asked === 0 && heard < SENTENCES_NEEDED) {
    return step(`Read this aloud (${heard + 1} of ${SENTENCES_NEEDED}). Tiro must stay silent.`, {
      say: sentences[heard % sentences.length],
      detail: waitForLog,
    });
  }
  if (asked === 0 && updates < UPDATES_NEEDED) {
    return step(`Press Send a screen update (${updates} of ${UPDATES_NEEDED} sent). Tiro must stay silent.`, {
      detail: "Leave a few seconds between presses.",
    });
  }
  if (asked < QUESTIONS_NEEDED) {
    return step(`Press Ask a question (${asked} of ${QUESTIONS_NEEDED} asked). Tiro will ask you something aloud.`);
  }
  if (!saidAfterwards) {
    return step("Last one: read this aloud. Tiro must stay silent.", { say: sentences[0], detail: waitForLog });
  }
  return step("Press Stop.", { done: true });
}
