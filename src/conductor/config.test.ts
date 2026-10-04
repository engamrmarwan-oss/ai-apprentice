import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "./config";

describe("resolveConfig", () => {
  it("gives the design's defaults when a workflow stores nothing", () => {
    expect(resolveConfig({})).toMatchObject({
      settle_ms: 500,
      screen_still_ms: 1_500,
      speech_silent_ms: 1_500,
      reading_ms_per_word: 250,
      reading_max_ms: 5_000,
      screen_dwell_ms: 15_000,
      decision_window_ms: 20_000,
      follow_ups: 1,
      questions_window_ms: 600_000,
    });
  });

  it("has no ceiling on Tiro's turns", () => {
    expect(DEFAULT_CONFIG.max_questions).toBeNull();
  });

  it("keeps what the workflow stores", () => {
    const config = resolveConfig({ screen_dwell_ms: 10_000, max_questions: 5, guardrail_kinds: ["limit"] });
    expect(config.screen_dwell_ms).toBe(10_000);
    expect(config.max_questions).toBe(5);
    expect(config.guardrail_kinds).toEqual(["limit"]);
    expect(config.settle_ms).toBe(500);
  });

  it("falls back to the default for a value it cannot use", () => {
    const config = resolveConfig({ settle_ms: "soon", score_threshold: 4, screen_dwell_ms: -1, wake_words: "tiro" });
    expect(config.settle_ms).toBe(500);
    expect(config.score_threshold).toBe(0.6);
    expect(config.screen_dwell_ms).toBe(15_000);
    expect(config.wake_words).toEqual(["tiro", "tyro", "tero"]);
  });

  it("treats anything that is not an object as empty", () => {
    expect(resolveConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig([1, 2])).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig("x")).toEqual(DEFAULT_CONFIG);
  });
});
