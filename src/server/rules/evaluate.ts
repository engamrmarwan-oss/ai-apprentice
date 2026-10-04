import type { Condition } from "@/contract/rule";

/** What an element shows. Null: it is on the screen and empty. */
export type Shown = string | number | boolean | null;

/** Looks up what an element shows now. Undefined: the element is not on the screen. */
export type Lookup = (elementId: string) => Shown | undefined;

/**
 * `fired`: the situation the rule is about holds, so its action is due.
 * `clear`: it does not hold. `unknown`: it cannot be told from this screen.
 */
export type Outcome = "fired" | "clear" | "unknown";

const text = (value: Shown) => String(value ?? "").trim().toLowerCase();

/** A number as a person writes it on a screen: with separators, a currency sign or a unit. */
function number(value: Shown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/\d/.test(digits)) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function same(shown: Shown, wanted: string | number | boolean): boolean {
  if (typeof wanted === "number") return number(shown) === wanted;
  if (typeof wanted === "boolean") return shown === wanted || text(shown) === String(wanted);
  return text(shown) === wanted.trim().toLowerCase();
}

const not = (outcome: Outcome): Outcome => (outcome === "fired" ? "clear" : outcome === "clear" ? "fired" : "unknown");
const told = (holds: boolean): Outcome => (holds ? "fired" : "clear");

/**
 * The generic engine for deterministic rules (design section 5.3): it works a
 * condition out against what the screen shows, and knows nothing about any
 * tool, field or rule. An element that is not on the screen makes the answer
 * unknown, never a guess.
 */
export function evaluate(condition: Condition, valueOf: Lookup): Outcome {
  if ("all" in condition) {
    const parts = condition.all.map((part) => evaluate(part, valueOf));
    return parts.includes("clear") ? "clear" : parts.includes("unknown") ? "unknown" : "fired";
  }
  if ("any" in condition) {
    const parts = condition.any.map((part) => evaluate(part, valueOf));
    return parts.includes("fired") ? "fired" : parts.includes("unknown") ? "unknown" : "clear";
  }
  if ("empty" in condition) {
    const shown = valueOf(condition.empty.element);
    return shown === undefined ? "unknown" : told(shown === null || text(shown) === "");
  }

  const [ref, wanted] = "eq" in condition ? condition.eq : "neq" in condition ? condition.neq : "gt" in condition ? condition.gt : "lt" in condition ? condition.lt : condition.in;
  const shown = valueOf(ref.element);
  if (shown === undefined) return "unknown";

  if ("eq" in condition) return told(same(shown, condition.eq[1]));
  if ("neq" in condition) return not(told(same(shown, condition.neq[1])));
  if ("in" in condition) return told(condition.in[1].some((one) => same(shown, one)));

  const amount = number(shown);
  if (amount === null) return "unknown";
  return told("gt" in condition ? amount > (wanted as number) : amount < (wanted as number));
}

/** Every element a condition refers to. */
export function elementsOf(condition: Condition): string[] {
  if ("all" in condition) return condition.all.flatMap(elementsOf);
  if ("any" in condition) return condition.any.flatMap(elementsOf);
  if ("empty" in condition) return [condition.empty.element];
  const [ref] = "eq" in condition ? condition.eq : "neq" in condition ? condition.neq : "gt" in condition ? condition.gt : "lt" in condition ? condition.lt : condition.in;
  return [ref.element];
}

/**
 * The type check (design section 5.2): a deterministic condition must refer
 * only to elements that exist in the tool map. One that does not cannot be a
 * fixed check, and the rule is judged instead.
 */
export function refersOnlyTo(condition: Condition, elements: ReadonlySet<string>): boolean {
  return elementsOf(condition).every((element) => elements.has(element));
}
