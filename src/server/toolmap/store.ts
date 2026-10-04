import "server-only";
import type { Json } from "@/contract/database.types";
import { eventSchema, type TiroEvent } from "@/contract/event";
import { must, withDatabase } from "../accounts";
import type { TiroClient } from "../supabase";
import { gatherToolMap, type SeenFrame } from "./gather";

type Unavailable = { ok: false; reason: "unavailable" };
const unavailable: Unavailable = { ok: false, reason: "unavailable" };

export type ToolElement = { id: string; kind: "field" | "button" | "status"; label: string; allowed_values: string[] | null; personal: boolean; origin: string };
export type ToolScreen = { id: string; name: string; origin: string; hidden: boolean; elements: ToolElement[] };
/** A screen with the name Tiro read it under, which stays the same when the expert renames it. */
type StoredScreen = ToolScreen & { seen_as: string | null };
export type ToolMapView = { tool: { id: string; name: string }; screens: ToolScreen[] };

const texts = (value: Json | null): string[] | null => (Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : null);

async function readStored(client: TiroClient, toolId: string): Promise<{ tool: { id: string; name: string }; screens: StoredScreen[] } | null> {
  const tool = must(await client.from("tools").select("id, name").eq("id", toolId).maybeSingle());
  if (!tool) return null;
  const screens = must(await client.from("tool_screens").select("id, name, seen_as, origin, hidden").eq("tool_id", toolId).order("created_at").order("id")) ?? [];
  const elements = screens.length
    ? (must(await client.from("tool_elements").select("id, screen_id, kind, label, allowed_values, personal, origin").in("screen_id", screens.map((screen) => screen.id)).order("created_at").order("id")) ?? [])
    : [];
  return {
    tool,
    screens: screens.map((screen) => ({
      ...screen,
      elements: elements
        .filter((element) => element.screen_id === screen.id)
        .map(({ id, kind, label, allowed_values, personal, origin }) => ({ id, kind: kind as ToolElement["kind"], label, allowed_values: texts(allowed_values), personal, origin })),
    })),
  };
}

async function readToolMap(client: TiroClient, toolId: string): Promise<ToolMapView | null> {
  const stored = await readStored(client, toolId);
  if (!stored) return null;
  return { tool: stored.tool, screens: stored.screens.map((screen) => ({ id: screen.id, name: screen.name, origin: screen.origin, hidden: screen.hidden, elements: screen.elements })) };
}

/** A workflow's tool map: the screens of its tool and what is on them. Null when the workflow does not exist. */
export async function loadToolMap(workflowId: string): Promise<{ ok: true; tool_map: ToolMapView | null } | Unavailable> {
  const read = await withDatabase(async (client) => {
    const workflow = must(await client.from("workflows").select("tool_id").eq("id", workflowId).maybeSingle());
    return workflow ? readToolMap(client, workflow.tool_id) : null;
  });
  return read.ok ? { ok: true, tool_map: read.value } : unavailable;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Brings the tool map up to date with everything Tiro has read in the
 * workflow's sessions. What is new is added with the origin `seen_live`.
 * Nothing the expert renamed, hid or marked is touched, and nothing is
 * removed. Values newly seen for a known element are added to it.
 */
export async function refreshToolMap(workflowId: string): Promise<{ ok: true; tool_map: ToolMapView | null; added: number } | Unavailable> {
  const run = await withDatabase(async (client) => {
    const workflow = must(await client.from("workflows").select("tool_id").eq("id", workflowId).maybeSingle());
    if (!workflow) return { tool_map: null, added: 0 };
    const sessions = must(await client.from("sessions").select("id").eq("workflow_id", workflowId)) ?? [];
    const ids = sessions.map((session) => session.id);
    if (ids.length === 0) return { tool_map: await readToolMap(client, workflow.tool_id), added: 0 };

    const [frameRows, eventRows] = await Promise.all([
      client.from("frames").select("id, reading").in("session_id", ids).not("reading", "is", null).order("t_ms").limit(2000),
      client.from("events").select("id, session_id, type, t_ms, confidence, verified, frame_id, screen_id, element_id, payload").in("session_id", ids).order("t_ms").limit(5000),
    ]);
    const events = (must(eventRows) ?? []).flatMap((row) => {
      const parsed = eventSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
    const byFrame = new Map<string, TiroEvent[]>();
    for (const event of events) byFrame.set(event.frame_id, [...(byFrame.get(event.frame_id) ?? []), event]);
    const frames: SeenFrame[] = (must(frameRows) ?? []).map((row) => ({ reading: row.reading as SeenFrame["reading"], events: byFrame.get(row.id) ?? [] }));

    const seen = gatherToolMap(frames);
    const existing = (await readStored(client, workflow.tool_id))?.screens ?? [];
    const known = existing.flatMap((screen) => screen.elements);
    let added = 0;
    // Rows stored together would share one moment. Each gets its own, so the map keeps the order things were seen in.
    let moment = Date.now();
    const next = () => new Date(moment++).toISOString();

    for (const screen of seen) {
      // A screen is known by the name it was read under, whatever the expert has called it since.
      let screenId = existing.find((one) => same(one.seen_as ?? one.name, screen.name))?.id;
      const fresh = screen.elements.filter((element) => !known.some((one) => (one.kind === "button") === (element.kind === "button") && same(one.label, element.label)));
      if (!screenId) {
        screenId = must(await client.from("tool_screens").insert({ tool_id: workflow.tool_id, name: screen.name, seen_as: screen.name, origin: "seen_live", created_at: next() }).select("id").single())?.id;
        added++;
      }
      if (screenId && fresh.length > 0) {
        must(
          await client
            .from("tool_elements")
            .insert(fresh.map((element) => ({ screen_id: screenId!, kind: element.kind, label: element.label, allowed_values: element.values as Json, origin: "seen_live", created_at: next() }))),
        );
        added += fresh.length;
      }
      // Values seen since last time are added to the element that already exists.
      for (const element of screen.elements) {
        const before = known.find((one) => (one.kind === "button") === (element.kind === "button") && same(one.label, element.label));
        if (!before || !element.values) continue;
        const has = new Set((before.allowed_values ?? []).map((value) => value.toLowerCase()));
        const merged = [...(before.allowed_values ?? []), ...element.values.filter((value) => !has.has(value.toLowerCase()))].sort((a, b) => a.localeCompare(b));
        if (merged.length !== (before.allowed_values ?? []).length) must(await client.from("tool_elements").update({ allowed_values: merged as Json }).eq("id", before.id));
      }
    }
    return { tool_map: await readToolMap(client, workflow.tool_id), added };
  });
  return run.ok ? { ok: true, ...run.value } : unavailable;
}

/** Renames or hides a screen of the workflow's tool. `found` is false when the tool has no such screen. */
export async function changeScreen(workflowId: string, screenId: string, change: { name?: string; hidden?: boolean }): Promise<{ ok: true; found: boolean } | Unavailable> {
  const run = await withDatabase(async (client) => {
    const workflow = must(await client.from("workflows").select("tool_id").eq("id", workflowId).maybeSingle());
    if (!workflow) return false;
    const rows = must(await client.from("tool_screens").update(change).eq("id", screenId).eq("tool_id", workflow.tool_id).select("id")) ?? [];
    return rows.length > 0;
  });
  return run.ok ? { ok: true, found: run.value } : unavailable;
}

/** Marks an element as personal data, or takes the mark off. `found` is false when the tool has no such element. */
export async function changeElement(workflowId: string, elementId: string, change: { personal: boolean }): Promise<{ ok: true; found: boolean } | Unavailable> {
  const run = await withDatabase(async (client) => {
    const workflow = must(await client.from("workflows").select("tool_id").eq("id", workflowId).maybeSingle());
    if (!workflow) return false;
    const element = must(await client.from("tool_elements").select("id, tool_screens!inner(tool_id)").eq("id", elementId).eq("tool_screens.tool_id", workflow.tool_id).maybeSingle());
    if (!element) return false;
    must(await client.from("tool_elements").update(change).eq("id", elementId));
    return true;
  });
  return run.ok ? { ok: true, found: run.value } : unavailable;
}
