import { describe, expect, it } from "vitest";
import type { SensorFrame } from "@/sensor/screen-sensor";
import { debriefTrigger, hearsWakeWord, replacePending, spokenText, teachBackTrigger, triggerFor } from "./parts";

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
  const plan = { decisionAt: 0, summary: "So, after opening it, you held it, correct?", question: { id: "q", text: "Why hold it?", score: 0.8 } };

  it("carries the summary and the follow-up for a turn at a pause", () => {
    expect(triggerFor("summary", plan)).toBe("ASK:\nSUMMARY: So, after opening it, you held it, correct?\nFOLLOW-UP: Why hold it?");
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
