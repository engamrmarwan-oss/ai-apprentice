import "server-only";
import { describeEvent } from "@/conductor/describe";
import type { RuleAction } from "@/contract/rule";
import { must, mustHave, withDatabase, type User } from "./accounts";
import { evaluate, type Lookup, type Shown } from "./rules/evaluate";
import { judgeRules, type Situation } from "./rules/judge";
import { tallyMastery, verdictsToChecks, type MasteryOutcome, type RuleVerdict } from "./rules/mastery";
import { latestReading, loadTimeline, type Session, type SessionContext } from "./sessions";
import { loadToolMap } from "./toolmap/store";
import { latestWorkMap, loadWorkMap, type WorkMapRule, type WorkMapView } from "./workmap/maps";

type Unavailable = { ok: false; reason: "unavailable" };
const unavailable: Unavailable = { ok: false, reason: "unavailable" };

const SESSION_COLUMNS = "id, workflow_id, kind, language, phase, user_id, conversation_id, started_at, ended_at";

/** How much of what the learner just did the judge is shown. */
const RECENT_EVENTS = 12;

/**
 * Starts a tutor session on the workflow's newest confirmed Work Map. The
 * session pins that version: what is taught does not change under the
 * learner. `no_map` when the expert has not confirmed one yet.
 */
export async function startTutorSession(
  workflowId: string,
  user: User,
): Promise<{ ok: true; session: Session; work_map: WorkMapView } | { ok: false; reason: "no_map" } | Unavailable> {
  const latest = await latestWorkMap(workflowId, true);
  if (!latest.ok) return unavailable;
  const map = latest.work_map;
  if (!map) return { ok: false, reason: "no_map" };

  const created = await withDatabase(async (client) => {
    const session = mustHave(
      await client
        .from("sessions")
        .insert({ workflow_id: workflowId, kind: "tutor", phase: "teach", user_id: user.id, started_at: new Date().toISOString() })
        .select(SESSION_COLUMNS)
        .single(),
    );
    must(await client.from("tutor_runs").insert({ session_id: session.id, work_map_id: map.id }));
    return session as Session;
  });
  return created.ok ? { ok: true, session: created.value, work_map: map } : unavailable;
}

type Run = { id: string; work_map_id: string };

async function runOf(sessionId: string): Promise<{ ok: true; run: Run | null } | Unavailable> {
  const read = await withDatabase(async (client, signal) =>
    must(await client.from("tutor_runs").select("id, work_map_id").eq("session_id", sessionId).order("created_at").limit(1).abortSignal(signal).maybeSingle()),
  );
  return read.ok ? { ok: true, run: read.value } : unavailable;
}

/** The Work Map a tutor session teaches. Null when the session has none. */
export async function mapOfTutorSession(sessionId: string): Promise<{ ok: true; work_map: WorkMapView | null } | Unavailable> {
  const run = await runOf(sessionId);
  if (!run.ok) return unavailable;
  return run.run ? loadWorkMap(run.run.work_map_id) : { ok: true, work_map: null };
}

/** The confirmed process as the tutor is handed it at the start of a session: steps and rules, each rule with its id and the expert's words. */
export function mapAsText(map: Pick<WorkMapView, "steps" | "rules">): string {
  const steps = map.steps.map((step) => {
    const reason = step.reason?.text ? ` The expert's reason: "${step.reason.text}"` : "";
    return `${step.position}. ${step.title}: ${step.decision ?? ""}${reason}`;
  });
  const rules = map.rules.map((rule) => `- Rule ${rule.number} (id ${rule.id}, ${rule.kind}): ${rule.statement} The expert said: "${rule.quote.text}"`);
  return `STEPS\n${steps.join("\n") || "none"}\n\nRULES\n${rules.join("\n") || "none"}`;
}

/** A rule the learner broke, with what the tutor needs to explain it and show the expert's moment. */
export type Caught = {
  rule: WorkMapRule;
  /** What in the learner's words or action went against it. Null for a fixed check, which needs no explaining. */
  explanation: string | null;
  action: RuleAction;
};

export type CheckResult = {
  ok: true;
  /** One verdict per rule that could be checked. */
  verdicts: RuleVerdict[];
  caught: Caught[];
};

/**
 * Checks what the learner says they would do, or what they just did, against
 * every rule of the map the session teaches. Deterministic rules go to the
 * generic engine, judged rules to one model call; both give the same kind of
 * verdict, so the tutor does not care which fired. The verdicts are recorded
 * for the mastery report. A check that could not be made catches nothing: the
 * tutor never blocks the learner on a guess.
 */
export async function checkLearner(
  context: SessionContext,
  situation: Situation,
): Promise<CheckResult | { ok: false; reason: "no_map" } | Unavailable> {
  const { session, workflow } = context;
  const [run, screen, timeline, tool] = await Promise.all([runOf(session.id), latestReading(session.id), loadTimeline(session.id), loadToolMap(workflow.id)]);
  if (!run.ok || !timeline.ok) return unavailable;
  if (!run.run) return { ok: false, reason: "no_map" };
  const loaded = await loadWorkMap(run.run.work_map_id);
  if (!loaded.ok) return unavailable;
  if (!loaded.work_map) return { ok: false, reason: "no_map" };

  const rules = loaded.work_map.rules.filter((rule) => rule.status === "confirmed" || rule.status === "corrected");
  const verdicts: RuleVerdict[] = [];

  // Fixed checks first: they need no model. A fixed check describes a screen that breaks its rule, so it speaks
  // only for what the learner has done, and only when it fires. Everything else is judged.
  if (situation.kind === "action" && screen.ok && screen.state && tool.ok && tool.tool_map) {
    const lookup = screenLookup(tool.tool_map.screens.flatMap((one) => one.elements), screen.state.fields);
    for (const rule of rules) {
      if (rule.check_type === "deterministic" && rule.condition && evaluate(rule.condition, lookup) === "fired") {
        verdicts.push({ rule_id: rule.id, verdict: "broken", explanation: null });
      }
    }
  }

  const judged = rules.filter((rule) => !verdicts.some((verdict) => verdict.rule_id === rule.id));
  if (judged.length > 0) {
    const ruling = await judgeRules({
      workflow: { tool: workflow.tool.name, task: workflow.task },
      rules: judged.map((rule) => ({ number: rule.number, kind: rule.kind, statement: rule.statement, quote: rule.quote.text })),
      screen: screen.ok ? screen.state : null,
      recent: timeline.timeline.events.slice(-RECENT_EVENTS).map(describeEvent),
      situation,
    });
    if (ruling.ok) {
      for (const one of ruling.value.verdicts) {
        const rule = judged.find((candidate) => candidate.number === one.rule);
        if (!rule || one.verdict === "not_relevant" || verdicts.some((verdict) => verdict.rule_id === rule.id)) continue;
        verdicts.push({ rule_id: rule.id, verdict: one.verdict, explanation: one.explanation.trim() || null });
      }
    }
  }

  const rows = verdictsToChecks(verdicts, situation).map((row) => ({ ...row, tutor_run_id: run.run!.id }));
  if (rows.length > 0) {
    // A check that cannot be recorded still stands: the learner is told now, the report is the poorer for it.
    await withDatabase(async (client) => must(await client.from("tutor_checks").insert(rows)));
  }

  const caught = verdicts.flatMap((verdict) => {
    const rule = rules.find((one) => one.id === verdict.rule_id);
    return rule && verdict.verdict === "broken" ? [{ rule, explanation: verdict.explanation, action: rule.action }] : [];
  });
  return { ok: true, verdicts, caught };
}

/**
 * Looks tool-map elements up on the screen the learner has open: an element
 * shows what the field with its label shows. An element with no such field is
 * not on this screen.
 */
export function screenLookup(elements: { id: string; label: string }[], fields: { name: string; value: string }[]): Lookup {
  const shown = new Map(fields.map((field) => [field.name.trim().toLowerCase(), field.value]));
  const labels = new Map(elements.map((element) => [element.id, element.label.trim().toLowerCase()]));
  return (elementId): Shown | undefined => {
    const label = labels.get(elementId);
    if (label === undefined || !shown.has(label)) return undefined;
    const value = shown.get(label)!;
    return value.trim() === "" ? null : value;
  };
}

export type MasteryReport = {
  session_id: string;
  work_map: { id: string; version: number };
  rules: { number: number; rule_id: string; kind: string; statement: string; outcome: MasteryOutcome }[];
  /** How many rules ended in each outcome. */
  totals: Record<MasteryOutcome, number>;
  /** The rules to practise next, most pressing first: the ones broken on screen, then the ones that needed a hint, then the ones never met. */
  practise_next: number[];
};

/** The mastery report of one tutor session: for every rule of the map it taught, how the learner did. */
export async function masteryReport(sessionId: string): Promise<{ ok: true; report: MasteryReport | null } | Unavailable> {
  const run = await runOf(sessionId);
  if (!run.ok) return unavailable;
  if (!run.run) return { ok: true, report: null };
  const [loaded, checks] = await Promise.all([
    loadWorkMap(run.run.work_map_id),
    withDatabase(async (client, signal) => must(await client.from("tutor_checks").select("rule_id, outcome").eq("tutor_run_id", run.run!.id).abortSignal(signal))),
  ]);
  if (!loaded.ok || !checks.ok) return unavailable;
  const map = loaded.work_map;
  if (!map) return { ok: true, report: null };

  const rules = map.rules.filter((rule) => rule.status === "confirmed" || rule.status === "corrected");
  const tally = tallyMastery(rules.map((rule) => rule.id), (checks.value ?? []) as { rule_id: string; outcome: MasteryOutcome }[]);
  return {
    ok: true,
    report: {
      session_id: sessionId,
      work_map: { id: map.id, version: map.version },
      rules: rules.map((rule) => ({ number: rule.number, rule_id: rule.id, kind: rule.kind, statement: rule.statement, outcome: tally.outcomes.get(rule.id) ?? "not_encountered" })),
      totals: tally.totals,
      practise_next: tally.practise_next.flatMap((id) => rules.find((rule) => rule.id === id)?.number ?? []),
    },
  };
}

/** Ends a tutor session. Ending twice changes nothing. */
export async function endTutorSession(session: Session): Promise<{ ok: true; session: Session } | Unavailable> {
  if (session.phase === "ended") return { ok: true, session };
  const run = await withDatabase(async (client) =>
    mustHave(
      await client.from("sessions").update({ phase: "ended", ended_at: new Date().toISOString() }).eq("id", session.id).select(SESSION_COLUMNS).single(),
    ),
  );
  return run.ok ? { ok: true, session: run.value as Session } : unavailable;
}
