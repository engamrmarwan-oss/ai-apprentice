import "server-only";
import { z } from "zod";
import { must, withDatabase } from "./accounts";
import { failSoft, type SoftResult } from "./fail-soft";
import { modelFor, requestStructured, text } from "./models";
import { loadBaseline, type BaselineStatement } from "./sessions";
import { loadToolMap, type ToolMapView } from "./toolmap/store";

type Unavailable = { ok: false; reason: "unavailable" };

/** Where a baseline statement can come from when it is assembled, most trusted first. */
export const ASSEMBLED_SOURCES = ["uploaded_process", "tool_map", "model_knowledge"] as const;
export type AssembledSource = (typeof ASSEMBLED_SOURCES)[number];

/** How many statements each source may give. The baseline aims questions; it is not a second process document. */
const MOST: Record<AssembledSource, number> = { uploaded_process: 20, tool_map: 6, model_knowledge: 5 };

export const baselineInputSchema = z.object({
  /** The company's written process, as text. Left out when there is none. */
  process_text: z.string().trim().max(60_000, "That document is too long. Send the part that describes this task.").optional(),
});

const proposedSchema = z.object({
  statements: z.array(z.object({ text: z.string(), source: z.enum(ASSEMBLED_SOURCES), detail: z.string().nullable() })),
});

export type ProposedStatement = z.infer<typeof proposedSchema>["statements"][number];

const BASELINE_SYSTEM = `You prepare an apprentice who is about to watch an expert do a task in a business application. You write down what the apprentice may assume before watching, so that it can ask about what turns out different.

You are given:
- TASK: the application, the task and the expert's role.
- PROCESS: the company's written process for this task, if there is one.
- TOOL MAP: the application's screens, with the fields, statuses and buttons seen on each, if any have been seen.

Return statements. Each is one plain sentence about how the task is done: a step, a rule, a limit, who decides, when to stop and ask. For each give:
- source: where it comes from.
  "uploaded_process": PROCESS says it. Write only what PROCESS says; do not improve on it. One statement for each step and each rule it gives.
  "tool_map": the screens and controls in TOOL MAP suggest it, such as the states an item can move through.
  "model_knowledge": it is usual for this kind of task and role, and neither PROCESS nor TOOL MAP says it. At most five, and only what an experienced person in this role would agree is usual.
- detail: for "uploaded_process", the few words of PROCESS it rests on. For "tool_map", the screen or control. Otherwise null.

Do not say the same thing twice. When PROCESS says something, do not repeat it from another source. When a source is missing, give no statements from it.`;

/** The model's input as text. Exported so tests can check what the model is shown. */
export function baselineContent(workflow: { tool: string; task: string; role: string | null }, processText: string | null, toolMap: ToolMapView | null): string {
  const screens = (toolMap?.screens ?? [])
    .filter((screen) => !screen.hidden)
    .map((screen) => ({ screen: screen.name, elements: screen.elements.map((element) => ({ kind: element.kind, label: element.label, values: element.allowed_values })) }));
  return [
    `TASK:\n${JSON.stringify({ application: workflow.tool, task: workflow.task, expert_role: workflow.role })}`,
    `PROCESS:\n${processText || "none"}`,
    `TOOL MAP:\n${screens.length > 0 ? JSON.stringify(screens) : "none"}`,
  ].join("\n\n");
}

/**
 * Code decides what of the proposal becomes baseline: nothing from a source
 * that was not given, nothing empty or repeated, and no more from each source
 * than its share.
 */
export function keepStatements(proposed: ProposedStatement[], given: { process: boolean; toolMap: boolean }): ProposedStatement[] {
  const kept: ProposedStatement[] = [];
  const count: Record<AssembledSource, number> = { uploaded_process: 0, tool_map: 0, model_knowledge: 0 };
  const seen = new Set<string>();
  for (const statement of proposed) {
    const said = statement.text.replace(/\s+/g, " ").trim();
    const key = said.toLowerCase();
    if (!said || seen.has(key)) continue;
    if (statement.source === "uploaded_process" && !given.process) continue;
    if (statement.source === "tool_map" && !given.toolMap) continue;
    if (count[statement.source] >= MOST[statement.source]) continue;
    seen.add(key);
    count[statement.source]++;
    kept.push({ text: said, source: statement.source, detail: statement.detail?.replace(/\s+/g, " ").trim() || null });
  }
  return kept;
}

function proposeBaseline(content: string): Promise<SoftResult<z.infer<typeof proposedSchema>>> {
  return failSoft(
    "baseline",
    async (signal) => {
      const response = await requestStructured({
        model: modelFor("text"),
        system: BASELINE_SYSTEM,
        content: [text(content)],
        schema: proposedSchema,
        effort: "low",
        maxTokens: 6000,
        signal,
      });
      return response.output;
    },
    { timeoutMs: 50_000 },
  );
}

/**
 * Assembles a workflow's baseline (design stage 1): what Tiro assumes before
 * it watches, each statement with its source and the status `assumed`. It
 * replaces what was assembled before; statements that came from a confirmed
 * Work Map are left alone.
 */
export async function assembleBaseline(
  workflow: { id: string; task: string; role: string | null; tool: { name: string } },
  processText: string | null,
): Promise<{ ok: true; statements: BaselineStatement[] } | { ok: false; reason: "model" } | Unavailable> {
  const tool = await loadToolMap(workflow.id);
  if (!tool.ok) return { ok: false, reason: "unavailable" };
  const hasMap = (tool.tool_map?.screens ?? []).some((screen) => !screen.hidden);

  const proposed = await proposeBaseline(baselineContent({ tool: workflow.tool.name, task: workflow.task, role: workflow.role }, processText, tool.tool_map));
  if (!proposed.ok) return { ok: false, reason: "model" };
  const kept = keepStatements(proposed.value.statements, { process: Boolean(processText), toolMap: hasMap });

  const stored = await withDatabase(async (client) => {
    must(await client.from("baseline_statements").delete().eq("workflow_id", workflow.id).in("source", [...ASSEMBLED_SOURCES]));
    if (kept.length > 0) {
      must(await client.from("baseline_statements").insert(kept.map((statement) => ({ workflow_id: workflow.id, text: statement.text, source: statement.source, source_detail: statement.detail }))));
    }
  });
  if (!stored.ok) return { ok: false, reason: "unavailable" };
  const read = await loadBaseline(workflow.id);
  return read.ok ? { ok: true, statements: read.statements } : { ok: false, reason: "unavailable" };
}
