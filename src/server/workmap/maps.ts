import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { describeEvent } from "@/conductor/describe";
import type { Json } from "@/contract/database.types";
import { eventSchema, type TiroEvent } from "@/contract/event";
import type { Question } from "@/contract/question";
import type { Condition, JudgeSpec, RuleAction } from "@/contract/rule";
import { must, mustHave, withDatabase } from "../accounts";
import { loadTimeline, queueQuestions, type SessionContext } from "../sessions";
import type { TiroClient } from "../supabase";
import { assemble, joinStretches, type Assembled, type LeftOut, type Said } from "./assemble";
import { proposeWorkMap, rewriteItem } from "./build";
import { whatIsMissing } from "./missing";

type Unavailable = { ok: false; reason: "unavailable" };
const unavailable: Unavailable = { ok: false, reason: "unavailable" };

/** A moment on the expert's screen: the event, and a short-lived address for its picture. */
export type Moment = { event_id: string; frame_id: string; t_ms: number; what: string; picture: string | null };

export type WorkMapStep = {
  id: string;
  position: number;
  title: string;
  decision: string | null;
  is_judgment: boolean;
  /** Why, in the expert's words. Null while they have not said. */
  reason: { utterance_id: string; text: string } | null;
  moment: Moment | null;
  /** The numbers of the rules that belong to this step. */
  rules: number[];
};

export type WorkMapRule = {
  id: string;
  /** Its place in the map's list of rules, from 1. It stays the same when the rule is corrected. */
  number: number;
  lineage_id: string;
  version: number;
  kind: string;
  statement: string;
  quote: { utterance_id: string; text: string };
  moment: Moment & { link: "direct" | "related" };
  action: RuleAction;
  status: string;
  provenance: string;
  documented: boolean;
  check_type: string;
  /** For a deterministic rule, the condition the generic engine works out. Null for a judged rule. */
  condition: Condition | null;
  /** The positions of the steps it belongs to. */
  steps: number[];
};

export type WorkMapView = {
  id: string;
  workflow_id: string;
  session_id: string;
  version: number;
  status: "draft" | "confirmed";
  created_at: string;
  confirmed_at: string | null;
  steps: WorkMapStep[];
  rules: WorkMapRule[];
};

/** How long a picture's address works. Long enough for a debrief or a lesson. */
const PICTURE_SECONDS = 60 * 60 * 2;

const MAP_COLUMNS = "id, workflow_id, session_id, version, status, created_at, confirmed_at";

/** The judge spec a rule starts with. The rule compiler replaces it when the rule is compiled. */
function firstJudgeSpec(statement: string, quote: string, eventId: string, utteranceId: string, note: string): JudgeSpec {
  return {
    question: `Does what is about to be done keep to this rule: ${statement}`,
    reasoning: quote,
    examples: [{ event_id: eventId, utterance_id: utteranceId, note }],
  };
}

async function readMap(client: TiroClient, mapId: string): Promise<WorkMapView | null> {
  const map = must(await client.from("work_maps").select(MAP_COLUMNS).eq("id", mapId).maybeSingle());
  if (!map) return null;

  const [stepRows, ruleRows] = await Promise.all([
    client.from("steps").select("id, position, title, decision, reason_utterance_id, event_id, frame_id, is_judgment").eq("work_map_id", mapId).order("position"),
    client.from("rules").select("*").eq("work_map_id", mapId).order("created_at").order("id"),
  ]);
  const steps = must(stepRows) ?? [];
  const allRules = must(ruleRows) ?? [];

  // The current version of each rule, in the order the rules first came to exist.
  const lineages = [...new Set(allRules.filter((rule) => rule.version === 1).map((rule) => rule.lineage_id))];
  const current = lineages.flatMap((lineage) => {
    const versions = allRules.filter((rule) => rule.lineage_id === lineage).sort((a, b) => b.version - a.version);
    return versions[0] && versions[0].status !== "rejected" ? [versions[0]] : [];
  });

  const eventIds = [...new Set([...steps.flatMap((step) => (step.event_id ? [step.event_id] : [])), ...current.map((rule) => rule.moment_event_id)])];
  const frameIds = [...new Set([...steps.flatMap((step) => (step.frame_id ? [step.frame_id] : [])), ...current.map((rule) => rule.moment_frame_id)])];
  const ruleIds = current.map((rule) => rule.id);

  const none = { data: [], error: null };
  const [utterances, events, frames, links] = await Promise.all([
    client.from("utterances").select("id, speaker, start_ms, end_ms, text_original").eq("session_id", map.session_id).order("start_ms"),
    eventIds.length ? client.from("events").select("id, session_id, type, t_ms, confidence, verified, frame_id, screen_id, element_id, payload").in("id", eventIds) : none,
    frameIds.length ? client.from("frames").select("id, storage_path").in("id", frameIds) : none,
    ruleIds.length ? client.from("rule_links").select("rule_id, step_id").in("rule_id", ruleIds) : none,
  ]);
  // A quote is the whole thought: the stretch it points at, joined with what the expert went on to say in the same breath.
  const lines = joinStretches((must(utterances) ?? []).map(({ text_original, ...row }) => ({ ...row, text: text_original }) as Said));
  const said = new Map(lines.map((line) => [line.id, line.text]));
  const frameRows = must(frames) ?? [];
  const signed = frameRows.length
    ? await client.storage.from("frames").createSignedUrls(frameRows.map((row) => row.storage_path), PICTURE_SECONDS)
    : { data: [], error: null };
  const pictures = new Map(frameRows.map((row, index) => [row.id, signed.data?.[index]?.signedUrl ?? null]));
  const shown = new Map(
    (must(events) ?? []).flatMap((row) => {
      const parsed = eventSchema.safeParse(row);
      return parsed.success ? [[parsed.data.id, parsed.data] as const] : [];
    }),
  );
  const linkRows = must(links) ?? [];

  const moment = (eventId: string | null, frameId: string | null): Moment | null => {
    const event = eventId ? shown.get(eventId) : undefined;
    if (!event || !frameId) return null;
    return { event_id: event.id, frame_id: frameId, t_ms: event.t_ms, what: describeEvent(event), picture: pictures.get(frameId) ?? null };
  };
  const positionOf = new Map(steps.map((step) => [step.id, step.position]));
  const numberOf = new Map(current.map((rule, index) => [rule.id, index + 1]));

  return {
    ...(map as Omit<WorkMapView, "steps" | "rules">),
    steps: steps.map((step) => ({
      id: step.id,
      position: step.position,
      title: step.title,
      decision: step.decision,
      is_judgment: step.is_judgment,
      reason: step.reason_utterance_id ? { utterance_id: step.reason_utterance_id, text: said.get(step.reason_utterance_id) ?? "" } : null,
      moment: moment(step.event_id, step.frame_id),
      rules: linkRows.filter((link) => link.step_id === step.id).flatMap((link) => numberOf.get(link.rule_id) ?? []).sort((a, b) => a - b),
    })),
    rules: current.map((rule, index) => ({
      id: rule.id,
      number: index + 1,
      lineage_id: rule.lineage_id,
      version: rule.version,
      kind: rule.kind,
      statement: rule.statement,
      quote: { utterance_id: rule.expert_quote_utterance_id, text: said.get(rule.expert_quote_utterance_id) ?? "" },
      moment: { ...(moment(rule.moment_event_id, rule.moment_frame_id) ?? { event_id: rule.moment_event_id, frame_id: rule.moment_frame_id, t_ms: 0, what: "", picture: null }), link: rule.moment_link as "direct" | "related" },
      action: rule.action as RuleAction,
      status: rule.status,
      provenance: rule.provenance,
      documented: rule.documented,
      check_type: rule.check_type,
      condition: (rule.condition as Condition | null) ?? null,
      steps: linkRows.filter((link) => link.rule_id === rule.id).flatMap((link) => positionOf.get(link.step_id) ?? []).sort((a, b) => a - b),
    })),
  };
}

/** One Work Map with its steps, its rules, and the words and pictures behind them. Null when there is no such map. */
export async function loadWorkMap(mapId: string): Promise<{ ok: true; work_map: WorkMapView | null } | Unavailable> {
  const read = await withDatabase((client) => readMap(client, mapId));
  return read.ok ? { ok: true, work_map: read.value } : unavailable;
}

/** The newest Work Map of a workflow. With `confirmedOnly`, the newest one the expert has confirmed. */
export async function latestWorkMap(
  workflowId: string,
  confirmedOnly: boolean,
): Promise<{ ok: true; work_map: WorkMapView | null } | Unavailable> {
  const read = await withDatabase(async (client) => {
    let query = client.from("work_maps").select("id").eq("workflow_id", workflowId);
    if (confirmedOnly) query = query.eq("status", "confirmed");
    const row = must(await query.order("version", { ascending: false }).limit(1).maybeSingle());
    return row ? readMap(client, row.id) : null;
  });
  return read.ok ? { ok: true, work_map: read.value } : unavailable;
}

/** Which workflow a map belongs to, for the guard. Null when there is no such map. */
export async function workflowOfMap(mapId: string): Promise<{ ok: true; workflow_id: string | null } | Unavailable> {
  const read = await withDatabase(async (client) => must(await client.from("work_maps").select("workflow_id").eq("id", mapId).maybeSingle()));
  return read.ok ? { ok: true, workflow_id: read.value?.workflow_id ?? null } : unavailable;
}

async function storeDraft(client: TiroClient, context: SessionContext, built: Assembled, said: Said[], events: TiroEvent[]): Promise<string> {
  const { session, workflow } = context;
  // One draft per session: building again replaces it.
  must(await client.from("work_maps").delete().eq("session_id", session.id).eq("status", "draft"));
  const newest = must(await client.from("work_maps").select("version").eq("workflow_id", workflow.id).order("version", { ascending: false }).limit(1).maybeSingle());
  const map = mustHave(
    await client
      .from("work_maps")
      .insert({ workflow_id: workflow.id, session_id: session.id, version: (newest?.version ?? 0) + 1 })
      .select("id")
      .single(),
  );

  const stepRows = built.steps.map((step, index) => ({
    id: randomUUID(),
    work_map_id: map.id,
    position: index + 1,
    title: step.title,
    decision: step.decision,
    reason_utterance_id: step.reason_utterance_id,
    event_id: step.event_id,
    frame_id: step.frame_id,
    is_judgment: step.is_judgment,
  }));
  if (stepRows.length > 0) must(await client.from("steps").insert(stepRows));

  const textOf = new Map(said.map((line) => [line.id, line.text]));
  const eventOf = new Map(events.map((event) => [event.id, event]));
  const storedAt = Date.now();
  const ruleRows = built.rules.map((rule, index) => {
    const id = randomUUID();
    const moment = eventOf.get(rule.moment_event_id);
    return {
      id,
      // Rules are numbered in the order they came to exist. Stored together, they would all share one moment.
      created_at: new Date(storedAt + index).toISOString(),
      lineage_id: id,
      version: 1,
      work_map_id: map.id,
      kind: rule.kind,
      statement: rule.statement,
      expert_quote_utterance_id: rule.quote_utterance_id,
      moment_event_id: rule.moment_event_id,
      moment_frame_id: rule.moment_frame_id,
      moment_link: rule.moment_link,
      // Every rule starts as one a model judges. The rule compiler makes it a fixed check where the tool map allows.
      check_type: "judged",
      judge_spec: firstJudgeSpec(rule.statement, textOf.get(rule.quote_utterance_id) ?? rule.statement, rule.moment_event_id, rule.quote_utterance_id, moment ? describeEvent(moment) : rule.statement) as unknown as Json,
      action: rule.action as unknown as Json,
      status: "candidate",
      provenance: rule.provenance,
      documented: false,
    };
  });
  if (ruleRows.length > 0) {
    must(await client.from("rules").insert(ruleRows));
    must(await client.from("rule_links").insert(ruleRows.map((row, index) => ({ rule_id: row.id, step_id: stepRows[built.rules[index].step].id }))));
  }

  for (const answer of built.answers) {
    must(
      await client
        .from("questions")
        .update({ status: "answered", answer_utterance_id: answer.utterance_id })
        .eq("id", answer.question_id)
        .eq("session_id", session.id)
        .neq("status", "answered"),
    );
  }
  return map.id;
}

export type BuildResult = {
  ok: true;
  work_map: WorkMapView;
  /** Questions the validator sent back to the debrief: steps that still lack the expert's reason. */
  gaps: Question[];
  left_out: LeftOut[];
};

/**
 * Builds the session's Work Map as a draft: a model proposes steps and rules
 * from the verified events and everything said, and the validator decides
 * what stands. With `final`, a step that still lacks a reason is left out
 * instead of being asked about again.
 */
export async function buildWorkMap(
  context: SessionContext,
  options: { final: boolean },
): Promise<BuildResult | Unavailable | { ok: false; reason: "builder" }> {
  const { session, workflow } = context;
  const [timeline, extra] = await Promise.all([
    loadTimeline(session.id),
    withDatabase(async (client, signal) => {
      const [lastFrame, kinds] = await Promise.all([
        client.from("frames").select("t_ms").eq("session_id", session.id).order("t_ms", { ascending: false }).limit(1).abortSignal(signal).maybeSingle(),
        client.from("rule_kinds").select("key, label, workflow_id").or(`workflow_id.is.null,workflow_id.eq.${workflow.id}`).abortSignal(signal),
      ]);
      return { taskEndedAt: must(lastFrame)?.t_ms ?? 0, ruleKinds: (must(kinds) ?? []).map(({ key, label }) => ({ key, label })) };
    }),
  ]);
  if (!timeline.ok || !extra.ok) return unavailable;

  const { events, utterances, questions } = timeline.timeline;
  const said = joinStretches(utterances.map(({ id, speaker, start_ms, end_ms, text }) => ({ id, speaker, start_ms, end_ms, text })));
  const { taskEndedAt, ruleKinds } = extra.value;

  const proposed = await proposeWorkMap({
    workflow: { tool: workflow.tool.name, task: workflow.task, role: workflow.role },
    language: session.language,
    events,
    said,
    questions,
    ruleKinds,
    taskEndedAt,
  });
  if (!proposed.ok) return { ok: false, reason: "builder" };

  const built = assemble(proposed.value.output, {
    events,
    said,
    questions,
    ruleKinds: ruleKinds.map((kind) => kind.key),
    taskEndedAt,
    final: options.final,
  });

  const stored = await withDatabase(async (client) => readMap(client, await storeDraft(client, context, built, said, events)));
  if (!stored.ok || !stored.value) return unavailable;

  // A gap already asked about is not queued twice.
  const known = new Set(questions.map((question) => question.text));
  const gaps = await queueQuestions(
    session.id,
    built.gaps
      .filter((gap) => !known.has(gap.text))
      .map((gap) => ({ text: gap.text, kind: "reason", trigger_event_id: gap.trigger_event_id, baseline_statement_id: null, score: 0.9, channel: "debrief" })),
  );
  return { ok: true, work_map: stored.value, gaps: gaps.ok ? gaps.questions : [], left_out: built.left_out };
}

// ---------------------------------------------------------------------------
// Corrections and confirmation
// ---------------------------------------------------------------------------

const words = z.string().trim().min(1).max(2_000);

/** A change to a step: either the expert's correction in their own words, or the new text itself. */
export const stepChangeSchema = z.union([
  z.strictObject({ correction: words }),
  z.strictObject({ title: words.optional(), decision: words.optional() }).refine((value) => value.title !== undefined || value.decision !== undefined, { message: "Say what to change." }),
]);

/** A change to a rule: either the expert's correction in their own words, or the new statement itself. */
export const ruleChangeSchema = z.union([z.strictObject({ correction: words }), z.strictObject({ statement: words })]);

type ChangeResult<T> = { ok: true; changed: T | null; work_map: WorkMapView } | Unavailable | { ok: false; reason: "rewrite" };

/** Corrects one step in place. `changed` is null when the map has no step at that position. */
export async function correctStep(mapId: string, position: number, change: z.infer<typeof stepChangeSchema>): Promise<ChangeResult<WorkMapStep>> {
  const loaded = await loadWorkMap(mapId);
  if (!loaded.ok || !loaded.work_map) return unavailable;
  const step = loaded.work_map.steps.find((one) => one.position === position);
  if (!step) return { ok: true, changed: null, work_map: loaded.work_map };

  let next: { title?: string; decision?: string };
  if ("correction" in change) {
    const rewritten = await rewriteItem({ what: "step", title: step.title, decision: step.decision ?? "" }, change.correction);
    if (!rewritten.ok || !rewritten.value.title.trim()) return { ok: false, reason: "rewrite" };
    next = { title: rewritten.value.title.trim(), decision: rewritten.value.decision.trim() || (step.decision ?? undefined) };
  } else {
    next = change;
  }

  const saved = await withDatabase(async (client) => {
    must(await client.from("steps").update(next).eq("id", step.id));
    return readMap(client, mapId);
  });
  if (!saved.ok || !saved.value) return unavailable;
  return { ok: true, changed: saved.value.steps.find((one) => one.position === position) ?? null, work_map: saved.value };
}

/**
 * Corrects one rule. The rule gets a new version; the old one is retired,
 * never deleted. `changed` is null when the map has no rule with that number.
 */
export async function correctRule(mapId: string, number: number, change: z.infer<typeof ruleChangeSchema>): Promise<ChangeResult<WorkMapRule>> {
  const loaded = await loadWorkMap(mapId);
  if (!loaded.ok || !loaded.work_map) return unavailable;
  const rule = loaded.work_map.rules.find((one) => one.number === number);
  if (!rule) return { ok: true, changed: null, work_map: loaded.work_map };

  let statement: string;
  if ("correction" in change) {
    const rewritten = await rewriteItem({ what: "rule", statement: rule.statement }, change.correction);
    if (!rewritten.ok || !rewritten.value.statement.trim()) return { ok: false, reason: "rewrite" };
    statement = rewritten.value.statement.trim();
  } else {
    statement = change.statement;
  }

  const saved = await withDatabase(async (client) => {
    const row = mustHave(await client.from("rules").select("*").eq("id", rule.id).single());
    const links = must(await client.from("rule_links").select("step_id").eq("rule_id", rule.id)) ?? [];
    const id = randomUUID();
    const spec = row.judge_spec as unknown as JudgeSpec | null;
    must(await client.from("rules").update({ status: "retired" }).eq("id", rule.id));
    must(
      await client.from("rules").insert({
        ...row,
        id,
        version: row.version + 1,
        statement,
        status: "corrected",
        created_at: undefined,
        // A corrected rule is judged again from its new wording until it is recompiled.
        check_type: "judged",
        condition: null,
        judge_spec: (spec
          ? { ...spec, question: `Does what is about to be done keep to this rule: ${statement}` }
          : firstJudgeSpec(statement, rule.quote.text || statement, rule.moment.event_id, rule.quote.utterance_id, rule.moment.what || statement)) as unknown as Json,
      }),
    );
    if (links.length > 0) must(await client.from("rule_links").insert(links.map((link) => ({ rule_id: id, step_id: link.step_id }))));
    return readMap(client, mapId);
  });
  if (!saved.ok || !saved.value) return unavailable;
  return { ok: true, changed: saved.value.rules.find((one) => one.number === number) ?? null, work_map: saved.value };
}

/**
 * The expert has confirmed the map. The validator has the last word: a map
 * with a step that lacks its screen moment or its reason is not confirmed.
 * Confirming ends the session, and closes every question still waiting.
 */
export async function confirmWorkMap(
  mapId: string,
): Promise<{ ok: true; work_map: WorkMapView } | { ok: false; reason: "incomplete"; missing: string[] } | { ok: false; reason: "not_found" } | Unavailable> {
  const loaded = await loadWorkMap(mapId);
  if (!loaded.ok) return unavailable;
  const map = loaded.work_map;
  if (!map) return { ok: false, reason: "not_found" };
  if (map.status === "confirmed") return { ok: true, work_map: map };
  const missing = whatIsMissing(map);
  if (missing.length > 0) return { ok: false, reason: "incomplete", missing };

  const saved = await withDatabase(async (client) => {
    const now = new Date().toISOString();
    must(await client.from("work_maps").update({ status: "confirmed", confirmed_at: now }).eq("id", mapId));
    must(await client.from("rules").update({ status: "confirmed" }).eq("work_map_id", mapId).eq("status", "candidate"));
    must(await client.from("questions").update({ status: "dropped" }).eq("session_id", map.session_id).eq("status", "queued"));
    must(await client.from("sessions").update({ phase: "ended", ended_at: now }).eq("id", map.session_id));
    return readMap(client, mapId);
  });
  if (!saved.ok || !saved.value) return unavailable;
  return { ok: true, work_map: saved.value };
}
