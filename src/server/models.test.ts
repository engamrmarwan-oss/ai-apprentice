import { afterEach, describe, expect, it, vi } from "vitest";
import { modelFor } from "./models";

afterEach(() => vi.unstubAllEnvs());

describe("modelFor", () => {
  it("reads frames live with the strong model unless a variable says otherwise", () => {
    vi.stubEnv("VISION_FAST_MODEL", "");
    vi.stubEnv("VISION_STRONG_MODEL", "");
    expect(modelFor("vision_fast")).toBe("claude-opus-5-5");
    expect(modelFor("vision_strong")).toBe("claude-opus-5-5");
  });

  it("lets a variable choose the model for a role", () => {
    vi.stubEnv("VISION_FAST_MODEL", "some-other-model");
    expect(modelFor("vision_fast")).toBe("some-other-model");
    expect(modelFor("text")).toBe("claude-opus-5-5");
  });

  it("plans Tiro's turns on a faster model than it reads and writes with", () => {
    vi.stubEnv("PLAN_MODEL", "");
    expect(modelFor("plan")).toBe("claude-sonnet-5-5");
  });
});
