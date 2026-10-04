import { describe, expect, it } from "vitest";
import { conditionSchema, type Condition } from "@/contract/rule";
import { elementsOf, evaluate, refersOnlyTo, type Shown } from "./evaluate";

// A hand-written fixture: a small tool map, a screen, and rules written by hand against it.
const AMOUNT = "00000000-0000-4000-8000-000000000001";
const STATUS = "00000000-0000-4000-8000-000000000002";
const OWNER = "00000000-0000-4000-8000-000000000003";
const REGION = "00000000-0000-4000-8000-000000000004";
const NOT_IN_MAP = "00000000-0000-4000-8000-000000000099";
const TOOL_MAP = new Set([AMOUNT, STATUS, OWNER, REGION]);

const screen = (values: Record<string, Shown>) => (element: string) => (element in values ? values[element] : undefined);
const el = (element: string) => ({ element });

const OVER_LIMIT: Condition = { gt: [el(AMOUNT), 10_000] };
const NEEDS_OWNER: Condition = { all: [{ eq: [el(STATUS), "Ready"] }, { empty: el(OWNER) }] };
const OUTSIDE: Condition = { any: [{ neq: [el(REGION), "North"] }, { in: [el(STATUS), ["Held", "Blocked"]] }] };

describe("the hand-written rules are valid conditions", () => {
  it.each([OVER_LIMIT, NEEDS_OWNER, OUTSIDE])("parses against the contract", (condition) => {
    expect(conditionSchema.safeParse(condition).success).toBe(true);
  });
});

describe("evaluate", () => {
  it("fires a limit when the amount on screen is over it, however it is written", () => {
    expect(evaluate(OVER_LIMIT, screen({ [AMOUNT]: "12,400.00 EUR" }))).toBe("fired");
    expect(evaluate(OVER_LIMIT, screen({ [AMOUNT]: "9 800" }))).toBe("clear");
    expect(evaluate(OVER_LIMIT, screen({ [AMOUNT]: 10_000 }))).toBe("clear");
    expect(evaluate({ lt: [el(AMOUNT), 100] }, screen({ [AMOUNT]: "€ 99,50" }))).toBe("fired");
  });

  it("does not guess when the element is not on the screen, or does not show a number", () => {
    expect(evaluate(OVER_LIMIT, screen({}))).toBe("unknown");
    expect(evaluate(OVER_LIMIT, screen({ [AMOUNT]: "on request" }))).toBe("unknown");
  });

  it("compares text without regard to case or stray space", () => {
    expect(evaluate({ eq: [el(STATUS), "ready"] }, screen({ [STATUS]: " Ready " }))).toBe("fired");
    expect(evaluate({ neq: [el(STATUS), "Ready"] }, screen({ [STATUS]: "Held" }))).toBe("fired");
    expect(evaluate({ in: [el(STATUS), ["Held", "Blocked"]] }, screen({ [STATUS]: "blocked" }))).toBe("fired");
    expect(evaluate({ eq: [el(STATUS), true] }, screen({ [STATUS]: true }))).toBe("fired");
  });

  it("tells an empty element from a missing one", () => {
    expect(evaluate({ empty: el(OWNER) }, screen({ [OWNER]: null }))).toBe("fired");
    expect(evaluate({ empty: el(OWNER) }, screen({ [OWNER]: "  " }))).toBe("fired");
    expect(evaluate({ empty: el(OWNER) }, screen({ [OWNER]: "Sam" }))).toBe("clear");
    expect(evaluate({ empty: el(OWNER) }, screen({}))).toBe("unknown");
  });

  it("needs every part of an `all`, and lets one clear part settle it", () => {
    expect(evaluate(NEEDS_OWNER, screen({ [STATUS]: "Ready", [OWNER]: null }))).toBe("fired");
    expect(evaluate(NEEDS_OWNER, screen({ [STATUS]: "Ready", [OWNER]: "Sam" }))).toBe("clear");
    expect(evaluate(NEEDS_OWNER, screen({ [STATUS]: "Ready" }))).toBe("unknown");
    expect(evaluate(NEEDS_OWNER, screen({ [STATUS]: "Draft" }))).toBe("clear");
  });

  it("needs one part of an `any`, and lets one fired part settle it", () => {
    expect(evaluate(OUTSIDE, screen({ [REGION]: "South" }))).toBe("fired");
    expect(evaluate(OUTSIDE, screen({ [REGION]: "North", [STATUS]: "Ready" }))).toBe("clear");
    expect(evaluate(OUTSIDE, screen({ [REGION]: "North" }))).toBe("unknown");
  });
});

describe("the type check", () => {
  it("lists every element a condition refers to", () => {
    expect(elementsOf(NEEDS_OWNER)).toEqual([STATUS, OWNER]);
    expect(elementsOf(OUTSIDE)).toEqual([REGION, STATUS]);
  });

  it("passes a condition whose elements are all in the tool map, and no other", () => {
    expect(refersOnlyTo(NEEDS_OWNER, TOOL_MAP)).toBe(true);
    expect(refersOnlyTo({ all: [OVER_LIMIT, { empty: el(NOT_IN_MAP) }] }, TOOL_MAP)).toBe(false);
  });
});
