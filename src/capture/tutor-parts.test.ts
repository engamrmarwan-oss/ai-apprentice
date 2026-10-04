import { describe, expect, it } from "vitest";
import { catchTrigger, clearTrigger, itemTrigger } from "./tutor-parts";

const rule = (number: number) => ({ id: `id-${number}`, number, statement: "Hold anything over the limit.", quote: { text: "I hold anything over the limit." } });

describe("the tutor's triggers", () => {
  it("tells the tutor which item was opened and what its fields show", () => {
    expect(itemTrigger("Order 7", "Orders", [{ name: "Amount", value: "12,400" }, { name: "Status", value: "Ready" }])).toBe(
      'ITEM: The learner has opened Order 7 on the screen "Orders".\nFIELDS: Amount: 12,400; Status: Ready',
    );
    expect(itemTrigger("Order 7", "", [])).toBe("ITEM: The learner has opened Order 7.\nFIELDS: none read");
  });

  it("shows only the first few fields", () => {
    const fields = Array.from({ length: 30 }, (_, n) => ({ name: `F${n}`, value: "x" }));
    expect(itemTrigger("Order 7", "", fields).split(";")).toHaveLength(12);
  });

  it("passes on an answer that broke no rule", () => {
    expect(clearTrigger("I would hold it.")).toBe('CLEAR: The learner said: "I would hold it."\nNo rule is broken.');
  });

  it("names every broken rule with its id and the expert's own words", () => {
    expect(catchTrigger({ said: "I would release it." }, [{ rule: rule(2), explanation: "The amount is over the limit." }], true)).toBe(
      'CATCH: The learner said: "I would release it."\nRULE 2 (id id-2): Hold anything over the limit.\nTHE EXPERT SAID: "I hold anything over the limit."\nWHAT GOES AGAINST IT: The amount is over the limit.\nTHEN: ask what they would do instead',
    );
  });

  it("says what the learner did when the catch comes after the action", () => {
    const trigger = catchTrigger({ did: 'Pressed "Release" on Order 7.' }, [{ rule: rule(1), explanation: null }], false);
    expect(trigger).toContain('The learner did this on screen: Pressed "Release" on Order 7.');
    expect(trigger).not.toContain("WHAT GOES AGAINST IT");
    expect(trigger.endsWith("THEN: give the floor back")).toBe(true);
  });
});
