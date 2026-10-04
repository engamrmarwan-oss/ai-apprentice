import "server-only";
import { describeEvent } from "@/conductor/describe";
import type { Json } from "@/contract/database.types";
import type { TiroEvent } from "@/contract/event";
import type { Question } from "@/contract/question";
import { must, withDatabase } from "../accounts";
import type { ImageInput } from "../models";
import { loadTimeline, queueQuestions, type NewQuestion, type SessionContext } from "../sessions";
import { toRead } from "../vision/events";
import { verifyFrame } from "../vision/reading";
import { isChecked, ruleOnFrame } from "./ruling";

type Unavailable = { ok: false; reason: "unavailable" };

/** Frames read at once. Each read takes several seconds; the debrief should not wait for them one by one. */
const AT_ONCE = 6;

type FrameRow = { id: string; t_ms: number; storage_path: string };

async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(work));
  }
}

/**
 * Reads every decision a second time, from the frame of record at full
 * resolution and against the frame before it. Agreement verifies the event;
 * disagreement becomes a question for the debrief. Running it again only
 * looks at what is still unverified.
 */
export async function verifyDecisions(
  context: SessionContext,
): Promise<{ ok: true; verified: number; doubted: number; questions: Question[] } | Unavailable> {
  const { session } = context;
  const [timeline, frameRows] = await Promise.all([
    loadTimeline(session.id),
    withDatabase(async (client, signal) =>
      must(await client.from("frames").select("id, t_ms, storage_path").eq("session_id", session.id).order("t_ms").abortSignal(signal)),
    ),
  ]);
  if (!timeline.ok || !frameRows.ok) return { ok: false, reason: "unavailable" };

  const frames: FrameRow[] = frameRows.value ?? [];
  const { events, questions } = timeline.timeline;
  const open = [...new Set(events.filter((event) => isChecked(event) && !event.verified).map((event) => event.frame_id))];

  let verified = 0;
  const doubted: TiroEvent[] = [];

  async function picture(path: string): Promise<ImageInput | null> {
    const read = await withDatabase(async (client) => {
      const file = await client.storage.from("frames").download(path);
      if (file.error) throw new Error(file.error.message);
      return Buffer.from(await file.data.arrayBuffer()).toString("base64");
    });
    return read.ok ? { data: read.value, mediaType: "image/jpeg" } : null;
  }

  await inBatches(open, AT_ONCE, async (frameId) => {
    const at = frames.findIndex((frame) => frame.id === frameId);
    // The first frame has nothing before it to compare with.
    if (at < 1) return;
    const [before, after] = await Promise.all([picture(frames[at - 1].storage_path), picture(frames[at].storage_path)]);
    if (!before || !after) return;

    const onFrame = events.filter((event) => event.frame_id === frameId);
    const checked = await verifyFrame(before, { full: after, changed: null }, onFrame.map(toRead), { timeoutMs: 45_000 });
    // A reading that could not be repeated leaves the events as they were: unverified, and asked about next time.
    if (!checked.ok) return;

    const ruling = ruleOnFrame(onFrame, checked.value.output.verdicts);
    const stored = await withDatabase(async (client) => {
      if (ruling.verified.length > 0) must(await client.from("events").update({ verified: true }).in("id", ruling.verified));
      for (const one of ruling.corrected) {
        must(await client.from("events").update({ verified: true, payload: one.payload as Json }).eq("id", one.id));
      }
    });
    if (!stored.ok) return;
    verified += ruling.verified.length + ruling.corrected.length;
    doubted.push(...ruling.doubted);
  });

  // Doubt becomes a question, once: an event already asked about is not asked about again.
  const asked = new Set(questions.filter((question) => question.kind === "confirm_reading").map((question) => question.trigger_event_id));
  const doubts: NewQuestion[] = doubted
    .filter((event) => !asked.has(event.id))
    .map((event) => ({
      text: `I think I saw this: ${describeEvent(event)} Did I read that right?`,
      kind: "confirm_reading",
      trigger_event_id: event.id,
      baseline_statement_id: null,
      score: 0.9,
      channel: "debrief",
    }));
  const queued = await queueQuestions(session.id, doubts);
  return { ok: true, verified, doubted: doubted.length, questions: queued.ok ? queued.questions : [] };
}
