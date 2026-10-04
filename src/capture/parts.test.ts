import { describe, expect, it } from "vitest";
import type { SensorFrame } from "@/sensor/screen-sensor";
import { debriefTrigger, emptyMapTrigger, hearsWakeWord, replacePending, spokenText, startsVisit, teachBackTrigger, triggerFor, heardTrigger } from "./parts";

const WORDS = ["tiro", "tyro", "tero"];

describe("hearsWakeWord", () => {
  it("hears the name however it is cased or punctuated", () => {
    expect(hearsWakeWord("Tiro, one thing you should know", WORDS)).toBe(true);
    expect(hearsWakeWord("hey TYRO!", WORDS)).toBe(true);
  });

  it("does not hear it inside another word, or when it was not said", () => {
    expect(hearsWakeWord("the tyrosine level", WORDS)).toBe(false);
    expect(hearsWakeWord("this one looks fine to me", WORDS)).toBe(false);
    expect(hearsWakeWord("", WORDS)).toBe(false);
  });
});

describe("spokenText", () => {
  it("drops the voice model's stage directions and keeps the words", () => {
    expect(spokenText("[warm] Hi Sam.  What are you about to do?")).toBe("Hi Sam. What are you about to do?");
    expect(spokenText("\n\nGot it, I'm ready.")).toBe("Got it, I'm ready.");
    expect(spokenText("[curious]")).toBe("");
  });
});

describe("triggerFor", () => {
  const plan = { at: 0, summary: "So you are checking which orders can be released, correct?", question: { id: "q", text: "Why hold it?", score: 0.8 } };

  it("carries the summary and the follow-up for a turn at a pause", () => {
    expect(triggerFor("summary", plan)).toBe("ASK:\nSUMMARY: So you are checking which orders can be released, correct?\nFOLLOW-UP: Why hold it?");
  });

  it("says there is no follow-up when nothing is worth asking", () => {
    expect(triggerFor("summary", { ...plan, question: null })).toContain("FOLLOW-UP: none");
  });

  it("starts the opening and the called turn with their own words", () => {
    expect(triggerFor("opening", null)).toMatch(/^START:/);
    expect(triggerFor("called", null)).toBe("LISTEN: The expert has called you.");
  });

  it("tells the agent what the expert said when the call was only made out afterwards", () => {
    expect(triggerFor("called", null, "Tiro, anything above ten thousand needs a second signature.")).toBe(
      "LISTEN: The expert has called you. They said: Tiro, anything above ten thousand needs a second signature.",
    );
  });
});

describe("replacePending", () => {
  const frame = (t: number, region: SensorFrame["region"]): SensorFrame => ({
    t,
    cause: "settled",
    region,
    width: 100,
    height: 100,
    full: new Blob(),
    small: new Blob(),
    changed: null,
  });

  it("takes the frame when nothing is waiting", () => {
    const next = frame(1, null);
    expect(replacePending(null, next)).toBe(next);
  });

  it("keeps the newest frame and widens its region to cover the one it replaces", () => {
    const merged = replacePending(frame(1, { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }), frame(2, { x: 0.5, y: 0.5, width: 0.2, height: 0.2 }));
    expect(merged.t).toBe(2);
    expect(merged.region).toMatchObject({ x: 0.1, y: 0.1 });
    expect(merged.region?.width).toBeCloseTo(0.6);
    expect(merged.region?.height).toBeCloseTo(0.6);
  });
});

describe("the debrief's triggers", () => {
  it("numbers the questions so the agent asks them in order", () => {
    expect(debriefTrigger(["Did I read that right?", "When would you stop?"])).toBe("DEBRIEF:\nQUESTIONS:\n1. Did I read that right?\n2. When would you stop?");
  });

  it("hands the map over with the numbers corrections will refer to", () => {
    const trigger = teachBackTrigger({
      steps: [
        { position: 1, title: "Hold the order", decision: "Held it for review.", reason: "Finance signs it off first." },
        { position: 2, title: "Release it", decision: null, reason: null },
      ],
      rules: [{ number: 1, kind: "limit", statement: "Hold anything over the limit." }],
    });
    expect(trigger).toBe(
      'TEACH-BACK:\nSTEPS:\n1. Hold the order: Held it for review. The expert\'s reason: "Finance signs it off first."\n2. Release it: \nRULES:\n1. (limit) Hold anything over the limit.',
    );
  });

  it("says so when there is nothing to teach", () => {
    expect(teachBackTrigger({ steps: [], rules: [] })).toBe("TEACH-BACK:\nSTEPS:\nnone\nRULES:\nnone");
  });
});

describe("startsVisit", () => {
  it("starts the first visit, and one on a screen with another name", () => {
    expect(startsVisit(null, "requirements", [])).toBe(true);
    expect(startsVisit("requirements", "process map", [])).toBe(true);
  });

  it("keeps the visit while the expert works on the same screen", () => {
    expect(startsVisit("requirements", "requirements", [{ type: "field_change" }, { type: "commit" }])).toBe(false);
  });

  // The replay of 2026-10-04: the reader named every tab of a requirement "Requirements", and Tiro stayed silent for two and a half minutes.
  it("starts a visit when the expert moves to another tab or item that the reader gives the same name", () => {
    expect(startsVisit("requirements", "requirements", [{ type: "navigate" }])).toBe(true);
    expect(startsVisit("requirements", "requirements", [{ type: "open_item" }])).toBe(true);
  });
});

describe("emptyMapTrigger", () => {
  it("tells Tiro there is nothing to explain back or confirm, with the reasons", () => {
    const trigger = emptyMapTrigger([{ what: "step", text: "Approved REQ-003", why: "No reason was given for it." }]);
    expect(trigger).toMatch(/^WAIT:/);
    expect(trigger).toContain('- step "Approved REQ-003": No reason was given for it.');
    expect(trigger).toContain("Do not ask them to confirm anything.");
  });

  it("says nothing was recorded when nothing was left out either", () => {
    expect(emptyMapTrigger([])).toContain("Nothing was recorded that could become a step or a rule.");
  });
});

describe("an answer the agent did not hear", () => {
  // Seen in a live session: the expert answered "Correct." to every summary, the agent heard none of it,
  // and no follow-up question was ever asked.
  it("is passed on in the expert's own words, all stretches of it", () => {
    expect(heardTrigger(["Correct."])).toBe('HEARD: The expert answered: "Correct."');
    expect(heardTrigger(["Yes,", "that is right."])).toBe('HEARD: The expert answered: "Yes, that is right."');
  });
});

describe("a turn with more than one question", () => {
  const plan = { at: 0, summary: "You are checking the order, right?", question: { id: "q1", text: "Why hold it?", score: 0.9 }, more: [{ id: "q2", text: "Where is the limit?", score: 0.8 }] };

  it("hands the agent the follow-up and what to ask after it", () => {
    expect(triggerFor("summary", plan)).toBe("ASK:\nSUMMARY: You are checking the order, right?\nFOLLOW-UP: Why hold it?\nTHEN ASK: Where is the limit?");
  });

  it("adds nothing when there is only the follow-up", () => {
    expect(triggerFor("summary", { ...plan, more: [] })).not.toContain("THEN ASK");
  });
});
