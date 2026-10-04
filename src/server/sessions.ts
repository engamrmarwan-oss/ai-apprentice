import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resolveConfig, type WorkflowConfig } from "@/conductor/config";
import type { Json } from "@/contract/database.types";
import { eventSchema, type TiroEvent } from "@/contract/event";
import { QUESTION_KINDS, questionSchema, type Question, type QuestionKind } from "@/contract/question";
import { must, mustHave, withDatabase, type User } from "./accounts";
import type { ScreenState } from "./vision/reading";

/** One recording. Only expert sessions exist so far; tutor sessions arrive with the tutor. */
export type Session = {
  id: string;
  workflow_id: string;
  kind: "expert" | "tutor";
  language: string;
  phase: "setup" | "capture" | "debrief" | "teach" | "ended";
  user_id: string | null;
  conversation_id: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export type SessionWorkflow = {
  id: string;
  task: string;
  /** The expert's job title, as they gave it. */
  role: string | null;
  tool: { id: string; name: string };
  config: WorkflowConfig;
};

export type SessionContext = { session: Session; workflow: SessionWorkflow };

export type Utterance = {
  id: string;
  session_id: string;
  speaker: "expert" | "new_hire" | "agent";
  start_ms: number;
  end_ms: number;
  text: string;
};

export type BaselineStatement = { id: string; text: string; source: string; status: string };

type Unavailable = { ok: false; reason: "unavailable" };
const unavailable: Unavailable = { ok: false, reason: "unavailable" };

const SESSION_COLUMNS = "id, workflow_id, kind, language, phase, user_id, conversation_id, started_at, ended_at";

export const newSessionSchema = z.object({
  /** The language the expert will speak, as a two-letter code. */
  language: z.string().trim().toLowerCase().regex(/^[a-z]{2}$/, "Use a two-letter language code.").optional(),
});

export const utteranceSchema = z
  .object({
    speaker: z.enum(["expert", "agent"]),
    start_ms: z.int().nonnegative(),
    end_ms: z.int().nonnegative(),
    text: z.string().trim().min(1, "There is nothing to store.").max(8_000),
  })
  .refine((value) => value.end_ms >= value.start_ms, { path: ["end_ms"], message: "It cannot end before it starts." });

export const questionUpdateSchema = z
  .object({
    status: z.enum(["asked", "answered", "dropped"]).optional(),
    channel: z.enum(["live", "debrief"]).optional(),
    answer_utterance_id: z.uuid().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Say what to change." });

/** A session with its workflow, or null when there is no such session. */
export async function loadSession(sessionId: string): Promise<{ ok: true; found: SessionContext | null } | Unavailable> {
  const read = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("sessions")
        .select(`${SESSION_COLUMNS}, workflows (id, task, role, config, tools (id, name))`)
        .eq("id", sessionId)
        .abortSignal(signal)
        .maybeSingle(),
    ),
  );
  if (!read.ok) return unavailable;
  const row = read.value;
  if (!row) return { ok: true, found: null };

  const { workflows, ...session } = row;
  return {
    ok: true,
    found: {
      session: session as Session,
      workflow: {
        id: workflows.id,
        task: workflows.task,
        role: workflows.role,
        tool: workflows.tools,
        config: resolveConfig(workflows.config),
      },
    },
  };
}

/** Starts an expert session on a workflow. It waits in `setup` until capture begins. */
export async function createSession(
  workflowId: string,
  user: User,
  input: z.infer<typeof newSessionSchema>,
): Promise<{ ok: true; session: Session } | Unavailable> {
  const run = await withDatabase(async (client) =>
    mustHave(
      await client
        .from("sessions")
        .insert({ workflow_id: workflowId, kind: "expert", language: input.language ?? "en", user_id: user.id })
        .select(SESSION_COLUMNS)
        .single(),
    ),
  );
  return run.ok ? { ok: true, session: run.value as Session } : unavailable;
}

/** The sessions one person has run on a workflow, newest first. */
export async function listSessions(workflowId: string, userId: string): Promise<{ ok: true; sessions: Session[] } | Unavailable> {
  const read = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("sessions")
        .select(SESSION_COLUMNS)
        .eq("workflow_id", workflowId)
        .eq("user_id", userId)
        .eq("kind", "expert")
        .order("created_at", { ascending: false })
        .limit(50)
        .abortSignal(signal),
    ),
  );
  return read.ok ? { ok: true, sessions: (read.value ?? []) as Session[] } : unavailable;
}

/** Moves a session to capture and starts its clock. Starting twice changes nothing. */
export async function startCapture(session: Session): Promise<{ ok: true; session: Session } | Unavailable> {
  if (session.phase !== "setup") return { ok: true, session };
  const run = await withDatabase(async (client) =>
    mustHave(
      await client
        .from("sessions")
        .update({ phase: "capture", started_at: new Date().toISOString() })
        .eq("id", session.id)
        .select(SESSION_COLUMNS)
        .single(),
    ),
  );
  return run.ok ? { ok: true, session: run.value as Session } : unavailable;
}

/** Records which voice conversation the session runs in. */
export async function setConversation(sessionId: string, conversationId: string): Promise<{ ok: true } | Unavailable> {
  const run = await withDatabase(async (client) =>
    must(await client.from("sessions").update({ conversation_id: conversationId }).eq("id", sessionId)),
  );
  return run.ok ? { ok: true } : unavailable;
}

/**
 * Ends the task: the session moves to the debrief, and every question still
 * waiting to be asked live waits for the debrief instead.
 */
export async function endTask(session: Session): Promise<{ ok: true; session: Session; moved: number } | Unavailable> {
  const run = await withDatabase(async (client) => {
    const moved =
      must(
        await client
          .from("questions")
          .update({ channel: "debrief" })
          .eq("session_id", session.id)
          .eq("status", "queued")
          .eq("channel", "live")
          .select("id"),
      ) ?? [];
    const updated = mustHave(
      await client.from("sessions").update({ phase: "debrief" }).eq("id", session.id).select(SESSION_COLUMNS).single(),
    );
    return { session: updated as Session, moved: moved.length };
  });
  return run.ok ? { ok: true, ...run.value } : unavailable;
}

// ---------------------------------------------------------------------------
// Frames and events
// ---------------------------------------------------------------------------

export type NewFrame = {
  id: string;
  session_id: string;
  t_ms: number;
  width: number;
  height: number;
  changed_region: Json | null;
};

export const framePath = (sessionId: string, frameId: string) => `${sessionId}/${frameId}.jpg`;

/** Stores a frame's picture and its row. The row must exist before any event can point at it. */
export async function storeFrame(frame: NewFrame, picture: Blob): Promise<{ ok: true } | Unavailable> {
  const path = framePath(frame.session_id, frame.id);
  const run = await withDatabase(async (client) => {
    const upload = await client.storage.from("frames").upload(path, picture, { contentType: "image/jpeg" });
    if (upload.error) throw new Error(upload.error.message);
    must(await client.from("frames").insert({ ...frame, storage_path: path }));
  });
  return run.ok ? { ok: true } : unavailable;
}

/** What the reader saw at the last frame it could read, to compare the next one with. */
export async function latestReading(sessionId: string): Promise<{ ok: true; state: ScreenState | null } | Unavailable> {
  const read = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("frames")
        .select("reading")
        .eq("session_id", sessionId)
        .not("reading", "is", null)
        .order("t_ms", { ascending: false })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle(),
    ),
  );
  if (!read.ok) return unavailable;
  return { ok: true, state: (read.value?.reading as ScreenState | null | undefined) ?? null };
}

/** Records what was read on a frame, and the events it gave rise to. */
export async function storeReading(
  frameId: string,
  reading: ScreenState,
  events: TiroEvent[],
): Promise<{ ok: true } | Unavailable> {
  const run = await withDatabase(async (client) => {
    must(await client.from("frames").update({ reading: reading as unknown as Json }).eq("id", frameId));
    if (events.length > 0) must(await client.from("events").insert(events.map((event) => ({ ...event, payload: event.payload as Json }))));
  });
  return run.ok ? { ok: true } : unavailable;
}

/** Marks a frame as one a question was asked about. `found` is false when the session has no such frame. */
export async function markKeyFrame(sessionId: string, frameId: string): Promise<{ ok: true; found: boolean } | Unavailable> {
  const run = await withDatabase(async (client) =>
    must(await client.from("frames").update({ is_key: true }).eq("id", frameId).eq("session_id", sessionId).select("id")),
  );
  return run.ok ? { ok: true, found: (run.value ?? []).length > 0 } : unavailable;
}

const EVENT_COLUMNS = "id, session_id, type, t_ms, confidence, verified, frame_id, screen_id, element_id, payload";

/** Rows as the contract's events. A row that no longer fits the contract is left out. */
function asEvents(rows: unknown[]): TiroEvent[] {
  return rows.flatMap((row) => {
    const parsed = eventSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

// ---------------------------------------------------------------------------
// Utterances and questions
// ---------------------------------------------------------------------------

/** Stores one stretch of speech. English is its own English version; other languages are translated later. */
export async function storeUtterance(
  session: Session,
  input: z.infer<typeof utteranceSchema>,
): Promise<{ ok: true; utterance: Utterance } | Unavailable> {
  const run = await withDatabase(async (client) =>
    mustHave(
      await client
        .from("utterances")
        .insert({
          session_id: session.id,
          speaker: input.speaker,
          start_ms: input.start_ms,
          end_ms: input.end_ms,
          language: session.language,
          text_original: input.text,
          text_english: session.language === "en" ? input.text : null,
        })
        .select("id, session_id, speaker, start_ms, end_ms, text_original")
        .single(),
    ),
  );
  if (!run.ok) return unavailable;
  const { text_original, ...rest } = run.value;
  return { ok: true, utterance: { ...rest, text: text_original } as Utterance };
}

const QUESTION_COLUMNS =
  "id, session_id, text, kind, trigger_event_id, baseline_statement_id, score, status, channel, answer_utterance_id";

function asQuestions(rows: unknown[]): Question[] {
  return rows.flatMap((row) => {
    const parsed = questionSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export type NewQuestion = Pick<Question, "text" | "kind" | "trigger_event_id" | "baseline_statement_id" | "score" | "channel">;

/** Queues questions. Returns them as stored. */
export async function queueQuestions(
  sessionId: string,
  questions: NewQuestion[],
): Promise<{ ok: true; questions: Question[] } | Unavailable> {
  if (questions.length === 0) return { ok: true, questions: [] };
  const rows = questions.map((question) => ({ ...question, id: randomUUID(), session_id: sessionId, status: "queued" }));
  const run = await withDatabase(async (client) =>
    must(await client.from("questions").insert(rows).select(QUESTION_COLUMNS)),
  );
  return run.ok ? { ok: true, questions: asQuestions(run.value ?? []) } : unavailable;
}

/** Changes a question's status, channel or answer. `question` is null when the session has no such question. */
export async function updateQuestion(
  sessionId: string,
  questionId: string,
  change: z.infer<typeof questionUpdateSchema>,
): Promise<{ ok: true; question: Question | null } | Unavailable> {
  const run = await withDatabase(async (client) =>
    must(
      await client
        .from("questions")
        .update(change)
        .eq("id", questionId)
        .eq("session_id", sessionId)
        .select(QUESTION_COLUMNS)
        .maybeSingle(),
    ),
  );
  if (!run.ok) return unavailable;
  return { ok: true, question: run.value ? (asQuestions([run.value])[0] ?? null) : null };
}

// ---------------------------------------------------------------------------
// Reading a session back
// ---------------------------------------------------------------------------

export type Timeline = { events: TiroEvent[]; utterances: Utterance[]; questions: Question[] };

/** Everything a session has recorded so far, in time order. */
export async function loadTimeline(sessionId: string): Promise<{ ok: true; timeline: Timeline } | Unavailable> {
  const read = await withDatabase(async (client, signal) => {
    const [events, utterances, questions] = await Promise.all([
      client.from("events").select(EVENT_COLUMNS).eq("session_id", sessionId).order("t_ms").order("created_at").abortSignal(signal),
      client
        .from("utterances")
        .select("id, session_id, speaker, start_ms, end_ms, text_original")
        .eq("session_id", sessionId)
        .order("start_ms")
        .abortSignal(signal),
      client.from("questions").select(QUESTION_COLUMNS).eq("session_id", sessionId).order("created_at").abortSignal(signal),
    ]);
    return { events: must(events) ?? [], utterances: must(utterances) ?? [], questions: must(questions) ?? [] };
  });
  if (!read.ok) return unavailable;
  return {
    ok: true,
    timeline: {
      events: asEvents(read.value.events),
      utterances: read.value.utterances.map(({ text_original, ...rest }) => ({ ...rest, text: text_original }) as Utterance),
      questions: asQuestions(read.value.questions),
    },
  };
}

/** What Tiro assumes about the workflow before watching. Empty until a baseline has been assembled. */
export async function loadBaseline(workflowId: string): Promise<{ ok: true; statements: BaselineStatement[] } | Unavailable> {
  const read = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("baseline_statements")
        .select("id, text, source, status")
        .eq("workflow_id", workflowId)
        .order("created_at")
        .abortSignal(signal),
    ),
  );
  return read.ok ? { ok: true, statements: read.value ?? [] } : unavailable;
}

const isQuestionKind = (value: string): value is QuestionKind => (QUESTION_KINDS as readonly string[]).includes(value);

/**
 * The question kinds that count as guardrails for a workflow: its own list if
 * it stores one, otherwise the rule kinds flagged as guardrails in the
 * database. Which kinds those are is data, not code.
 */
export async function guardrailKinds(workflow: SessionWorkflow): Promise<{ ok: true; kinds: QuestionKind[] } | Unavailable> {
  if (workflow.config.guardrail_kinds) return { ok: true, kinds: workflow.config.guardrail_kinds };
  const read = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("rule_kinds")
        .select("key, workflow_id")
        .eq("is_guardrail", true)
        .or(`workflow_id.is.null,workflow_id.eq.${workflow.id}`)
        .abortSignal(signal),
    ),
  );
  if (!read.ok) return unavailable;
  return { ok: true, kinds: (read.value ?? []).map((row) => row.key).filter(isQuestionKind) };
}
