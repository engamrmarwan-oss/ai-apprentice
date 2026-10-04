import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { must, withDatabase } from "../accounts";
import { loadToolMap } from "../toolmap/store";
import { isId } from "../workflows";
import { latestWorkMap, loadWorkMap, type WorkMapView } from "../workmap/maps";
import type { Caller } from "./access";
import { mapAnswer, momentAnswer, momentOf, ruleAnswer, ruleBy, rulesOfStep, stepAnswer, stepAt, type Task } from "./answers";

const INSTRUCTIONS = `Tiro holds Work Maps. A Work Map is how an expert does one task in one tool: the steps in order, and the rules the expert keeps to. Every step and rule comes with the expert's own words and the moment on the expert's screen it comes from, and every map here was confirmed by its expert.

To do the task the way the expert does it, call get_work_map first. Follow the steps in order, and before you act on a step, check its rules. Each rule says what to do when an action would break it: "block" means do not do it; "ask" and "escalate" mean stop and ask a person, for "escalate" the one it names; "warn" means point it out before going on. Where the map does not say what to do, say so and ask: do not fill the gap with a guess.

Everything here is read-only.`;

const TRY_AGAIN = "Tiro could not read the Work Map just now. Try again in a moment.";

const say = (answer: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(answer) }] });
const refuse = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/**
 * The map a call is about. Only a confirmed map can be read, and a key reads
 * only its own workflow's maps: any other id is answered as if no such map
 * existed.
 */
async function open(caller: Caller, mapId: string | undefined): Promise<{ ok: true; map: WorkMapView } | { ok: false; message: string }> {
  if (mapId === undefined) {
    if (caller.kind !== "key") return { ok: false, message: "Give the work_map_id." };
    const latest = await latestWorkMap(caller.workflow_id, true);
    if (!latest.ok) return { ok: false, message: TRY_AGAIN };
    return latest.work_map ? { ok: true, map: latest.work_map } : { ok: false, message: "This workflow has no confirmed Work Map yet." };
  }
  const missing = { ok: false as const, message: "There is no confirmed Work Map with that id." };
  if (!isId(mapId)) return missing;
  const loaded = await loadWorkMap(mapId);
  if (!loaded.ok) return { ok: false, message: TRY_AGAIN };
  const map = loaded.work_map;
  if (!map || map.status !== "confirmed" || (caller.kind === "key" && map.workflow_id !== caller.workflow_id)) return missing;
  return { ok: true, map };
}

async function taskOf(workflowId: string): Promise<Task | null> {
  const read = await withDatabase(async (client, signal) =>
    must(await client.from("workflows").select("task, role, tools (name)").eq("id", workflowId).abortSignal(signal).maybeSingle()),
  );
  return read.ok && read.value ? { tool: read.value.tools.name, task: read.value.task, learned_from: read.value.role } : null;
}

/** The labels the workflow's expert marked as personal data, lower-cased. Null when they could not be read. */
async function personalLabels(workflowId: string): Promise<Set<string> | null> {
  const loaded = await loadToolMap(workflowId);
  if (!loaded.ok) return null;
  const elements = loaded.tool_map?.screens.flatMap((screen) => screen.elements) ?? [];
  return new Set(elements.filter((element) => element.personal).map((element) => element.label.trim().toLowerCase()));
}

const workMapId = z
  .string()
  .optional()
  .describe("The Work Map's id. With a workflow's own key it may be left out: the newest confirmed map of that workflow is used.");
const position = z.number().int().positive().describe("The step's position in the map, from 1.");
const readOnly = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

/**
 * Tiro's MCP server for one request: five read-only tools over confirmed
 * Work Maps, answering for what this caller may read. Nothing here writes.
 */
export function buildServer(caller: Caller): McpServer {
  const server = new McpServer({ name: "tiro", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "get_work_map",
    {
      title: "Load a Work Map",
      description: "The whole confirmed Work Map: the tool and the task, every step in order with the expert's reason, and every rule with the expert's words and what to do when it would be broken. Call this first.",
      inputSchema: { work_map_id: workMapId },
      annotations: readOnly,
    },
    async ({ work_map_id }) => {
      const found = await open(caller, work_map_id);
      if (!found.ok) return refuse(found.message);
      const task = await taskOf(found.map.workflow_id);
      return task ? say(mapAnswer(found.map, task)) : refuse(TRY_AGAIN);
    },
  );

  server.registerTool(
    "get_step",
    {
      title: "Read one step",
      description: "One step of a Work Map as it stands now: what the expert decides there, why in the expert's own words, and the rules that belong to it, in full.",
      inputSchema: { work_map_id: workMapId, position },
      annotations: readOnly,
    },
    async ({ work_map_id, position }) => {
      const found = await open(caller, work_map_id);
      if (!found.ok) return refuse(found.message);
      const step = stepAt(found.map, position);
      if (!step) return refuse(`The map has no step ${position}. It has ${found.map.steps.length}.`);
      return say({ work_map_id: found.map.id, step: stepAnswer(step, found.map), rules: rulesOfStep(found.map, step).map(ruleAnswer) });
    },
  );

  server.registerTool(
    "list_rules_for_step",
    {
      title: "List a step's rules",
      description: "The rules that belong to one step of a Work Map, each with the expert's words and what to do when it would be broken. Check these before acting on the step.",
      inputSchema: { work_map_id: workMapId, position },
      annotations: readOnly,
    },
    async ({ work_map_id, position }) => {
      const found = await open(caller, work_map_id);
      if (!found.ok) return refuse(found.message);
      const step = stepAt(found.map, position);
      if (!step) return refuse(`The map has no step ${position}. It has ${found.map.steps.length}.`);
      return say({ work_map_id: found.map.id, step: step.position, rules: rulesOfStep(found.map, step).map(ruleAnswer) });
    },
  );

  server.registerTool(
    "get_rule",
    {
      title: "Read one rule",
      description: "One rule of a Work Map as it stands now, after any correction by the expert: its statement, the expert's own words, what to do when it would be broken, and the steps it belongs to. Give its number or its id.",
      inputSchema: {
        work_map_id: workMapId,
        number: z.number().int().positive().optional().describe("The rule's number in the map, from 1."),
        rule_id: z.string().optional().describe("The rule's id, in place of its number."),
      },
      annotations: readOnly,
    },
    async ({ work_map_id, number, rule_id }) => {
      if (number === undefined && rule_id === undefined) return refuse("Give the rule's number or its rule_id.");
      const found = await open(caller, work_map_id);
      if (!found.ok) return refuse(found.message);
      const rule = ruleBy(found.map, { number, rule_id });
      return rule ? say({ work_map_id: found.map.id, rule: ruleAnswer(rule) }) : refuse("The map has no such rule.");
    },
  );

  server.registerTool(
    "get_screen_moment",
    {
      title: "See the expert's screen at a moment",
      description: "The moment on the expert's screen behind a step or a rule: what the expert did, what the screen showed, and an address for its picture that works for about two hours. Give a step's position or a rule's number.",
      inputSchema: {
        work_map_id: workMapId,
        step: position.optional().describe("The position of the step whose moment is wanted."),
        rule: z.number().int().positive().optional().describe("The number of the rule whose moment is wanted, in place of a step."),
      },
      annotations: readOnly,
    },
    async ({ work_map_id, step, rule }) => {
      if ((step === undefined) === (rule === undefined)) return refuse("Give either a step's position or a rule's number.");
      const found = await open(caller, work_map_id);
      if (!found.ok) return refuse(found.message);
      const moment = momentOf(found.map, { step, rule });
      if (!moment) return refuse(step !== undefined ? `The map has no screen moment for step ${step}.` : `The map has no screen moment for rule ${rule}.`);
      // What is personal must be known before a screen is put into words: without it, nothing is said.
      const personal = await personalLabels(found.map.workflow_id);
      if (!personal) return refuse(TRY_AGAIN);
      return say({
        work_map_id: found.map.id,
        ...(step !== undefined ? { step } : { rule, said: moment.link === "direct" ? "at this moment" : "about this moment, later" }),
        ...momentAnswer(moment, personal),
      });
    },
  );

  return server;
}
