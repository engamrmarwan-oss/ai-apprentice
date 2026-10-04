import "server-only";
import { z } from "zod";
import type { Json } from "@/contract/database.types";
import { conditionSchema, type Condition } from "@/contract/rule";
import { must, withDatabase } from "../accounts";
import { failSoft, type SoftResult } from "../fail-soft";
import { modelFor, requestStructured, text } from "../models";
import { loadToolMap, type ToolElement } from "../toolmap/store";
import { loadWorkMap } from "../workmap/maps";
import { refersOnlyTo } from "./evaluate";

type Unavailable = { ok: false; reason: "unavailable" };

/**
 * Turns the model's condition into one the engine can run: element numbers
 * become element ids, and the result must be a valid condition that refers
 * only to elements of the tool map (the type check, design section 5.2).
 * Anything else is no condition, and the rule stays a judged one.
 */
export function toCondition(raw: string | null, elementIds: readonly string[]): Condition | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const withIds = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withIds);
    if (value === null || typeof value !== "object") return value;
    const entries = Object.entries(value);
    if (entries.length === 1 && entries[0][0] === "element") {
      const n = entries[0][1];
      return { element: typeof n === "number" && Number.isInteger(n) && n >= 0 && n < elementIds.length ? elementIds[n] : "" };
    }
    return Object.fromEntries(entries.map(([name, inner]) => [name, withIds(inner)]));
  };
  const condition = conditionSchema.safeParse(withIds(parsed));
  if (!condition.success) return null;
  return refersOnlyTo(condition.data, new Set(elementIds)) ? condition.data : null;
}

const compiledSchema = z.object({ rules: z.array(z.object({ rule: z.number(), condition: z.string().nullable() })) });

const COMPILE_SYSTEM = `You turn an expert's rules for a task in a business application into fixed checks, where that is possible.

You are given:
- RULES: the rules, numbered, each with the expert's own words.
- ELEMENTS: the fields, statuses and buttons of the application, numbered from 0, with the values each was seen to take.

For each rule, decide whether a screen state alone can show that the rule has been broken. If it can, give a condition that is true exactly when the screen shows that state. If it cannot, give null: the rule will then be judged case by case.

Give null when the rule is about why something is done, about an order of steps, about something the screen does not show, or about a judgment. Give null when you are not sure. A wrong fixed check is worse than none.

A condition is JSON, written as a string, built from:
- {"eq": [{"element": n}, value]}, {"neq": [{"element": n}, value]}: the element shows, or does not show, this value.
- {"gt": [{"element": n}, number]}, {"lt": [{"element": n}, number]}: the number the element shows is above, or below, this.
- {"in": [{"element": n}, [value, ...]]}: the element shows one of these values.
- {"empty": {"element": n}}: the element is empty.
- {"all": [condition, ...]}, {"any": [condition, ...]}.

Refer only to elements in ELEMENTS, by their number. Use the values exactly as ELEMENTS shows them. The shape of an answer, for a rule that some status must not be reached while an amount is above a limit: {"all":[{"gt":[{"element":0},1000]},{"eq":[{"element":3},"Released"]}]}`;

function proposeConditions(
  rules: { number: number; statement: string; quote: string }[],
  elements: ToolElement[],
): Promise<SoftResult<z.infer<typeof compiledSchema>>> {
  const listed = elements.map((element, n) => ({ n, kind: element.kind, label: element.label, values: element.allowed_values }));
  return failSoft(
    "compiler",
    async (signal) => {
      const response = await requestStructured({
        model: modelFor("text"),
        system: COMPILE_SYSTEM,
        content: [text(`RULES:\n${JSON.stringify(rules.map((rule) => ({ n: rule.number, rule: rule.statement, expert_said: rule.quote })))}\n\nELEMENTS:\n${JSON.stringify(listed)}`)],
        schema: compiledSchema,
        effort: "low",
        maxTokens: 4096,
        signal,
      });
      return response.output;
    },
    { timeoutMs: 45_000 },
  );
}

/**
 * The rule compiler (design section 5.2): for every rule of a Work Map, a
 * model proposes a fixed check over the tool map's elements, and code keeps
 * it only if it passes the type check. A rule that gets one becomes
 * `deterministic`; every other rule stays `judged`. Without a tool map, or
 * when the model cannot be reached, nothing changes.
 */
export async function compileRules(mapId: string): Promise<{ ok: true; fixed: number; judged: number } | Unavailable> {
  const loaded = await loadWorkMap(mapId);
  if (!loaded.ok) return { ok: false, reason: "unavailable" };
  const map = loaded.work_map;
  if (!map) return { ok: true, fixed: 0, judged: 0 };
  const tool = await loadToolMap(map.workflow_id);
  if (!tool.ok) return { ok: false, reason: "unavailable" };

  const elements = (tool.tool_map?.screens ?? []).filter((screen) => !screen.hidden).flatMap((screen) => screen.elements);
  const rules = map.rules;
  if (elements.length === 0 || rules.length === 0) return { ok: true, fixed: 0, judged: rules.length };

  const proposed = await proposeConditions(rules.map((rule) => ({ number: rule.number, statement: rule.statement, quote: rule.quote.text })), elements);
  if (!proposed.ok) return { ok: true, fixed: 0, judged: rules.length };

  const ids = elements.map((element) => element.id);
  const fixed = rules.flatMap((rule) => {
    const condition = toCondition(proposed.value.rules.find((one) => one.rule === rule.number)?.condition ?? null, ids);
    return condition ? [{ id: rule.id, condition }] : [];
  });
  if (fixed.length > 0) {
    const stored = await withDatabase(async (client) => {
      for (const one of fixed) {
        must(await client.from("rules").update({ check_type: "deterministic", condition: one.condition as unknown as Json, judge_spec: null }).eq("id", one.id));
      }
    });
    if (!stored.ok) return { ok: false, reason: "unavailable" };
  }
  return { ok: true, fixed: fixed.length, judged: rules.length - fixed.length };
}
