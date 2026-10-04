import { describe, expect, it } from "vitest";
import { toCondition } from "./compile";

const AMOUNT = "00000000-0000-4000-8000-000000000001";
const STATUS = "00000000-0000-4000-8000-000000000002";
const ELEMENTS = [AMOUNT, STATUS];

describe("toCondition", () => {
  it("turns element numbers into the tool map's element ids", () => {
    expect(toCondition('{"all":[{"gt":[{"element":0},1000]},{"eq":[{"element":1},"Released"]}]}', ELEMENTS)).toEqual({
      all: [{ gt: [{ element: AMOUNT }, 1000] }, { eq: [{ element: STATUS }, "Released"] }],
    });
  });

  it("is no condition when it refers to an element the tool map does not have", () => {
    expect(toCondition('{"empty":{"element":7}}', ELEMENTS)).toBeNull();
    expect(toCondition('{"empty":{"element":-1}}', ELEMENTS)).toBeNull();
    expect(toCondition('{"empty":{"element":"Amount"}}', ELEMENTS)).toBeNull();
  });

  it("is no condition when it is not valid JSON or not a condition the engine knows", () => {
    expect(toCondition("amount over 1000", ELEMENTS)).toBeNull();
    expect(toCondition('{"between":[{"element":0},1,2]}', ELEMENTS)).toBeNull();
    expect(toCondition('{"gt":[{"element":0},"a lot"]}', ELEMENTS)).toBeNull();
    expect(toCondition(null, ELEMENTS)).toBeNull();
  });
});
