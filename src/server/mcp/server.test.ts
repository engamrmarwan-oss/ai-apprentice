import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fake-db";
import { getSupabase } from "../supabase";
import { loadToolMap } from "../toolmap/store";
import { latestWorkMap, loadWorkMap } from "../workmap/maps";
import type { Caller } from "./access";
import { MAP_ID, orderDesk, WORKFLOW_ID } from "./fixture";
import { buildServer } from "./server";

vi.mock("../supabase", () => ({ getSupabase: vi.fn(), newPasswordClient: vi.fn() }));
vi.mock("../workmap/maps", () => ({ loadWorkMap: vi.fn(), latestWorkMap: vi.fn() }));
vi.mock("../toolmap/store", () => ({ loadToolMap: vi.fn() }));

const OTHER_WORKFLOW = "33333333-3333-4333-8333-333333333333";
const ownKey: Caller = { kind: "key", key_id: "key-1", workflow_id: WORKFLOW_ID };
const otherKey: Caller = { kind: "key", key_id: "key-2", workflow_id: OTHER_WORKFLOW };
const tutor: Caller = { kind: "tutor" };

const toolMap = (personal: string[]) => ({
  ok: true as const,
  tool_map: {
    tool: { id: "tool-1", name: "Order desk" },
    screens: [
      {
        id: "screen-1",
        name: "Order",
        origin: "seen_live",
        hidden: false,
        elements: ["Amount", "Customer"].map((label, n) => ({ id: `el-${n}`, kind: "field" as const, label, allowed_values: null, personal: personal.includes(label), origin: "seen_live" })),
      },
    ],
  },
});

/** A client connected to the server as this caller sees it, over a pair of in-memory pipes. */
async function connect(caller: Caller) {
  const db = fakeDb({ "workflows.select": { data: { task: "Review new orders", role: "Order reviewer", tools: { name: "Order desk" } }, error: null } });
  vi.mocked(getSupabase).mockReturnValue({ ok: true, client: db.client } as unknown as ReturnType<typeof getSupabase>);
  vi.mocked(loadWorkMap).mockImplementation(async (id) => ({ ok: true, work_map: id === MAP_ID ? orderDesk : null }));
  vi.mocked(latestWorkMap).mockResolvedValue({ ok: true, work_map: orderDesk });
  vi.mocked(loadToolMap).mockResolvedValue(toolMap([]));

  const [near, far] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([buildServer(caller).connect(far), client.connect(near)]);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[])[0].text;
    return { refused: result.isError === true, text, answer: result.isError ? null : JSON.parse(text) };
  };
  return { client, call };
}

afterEach(() => vi.resetAllMocks());

describe("the tools", () => {
  it("are the design's four and the one that loads a whole map, all read-only", async () => {
    const { client } = await connect(ownKey);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["get_rule", "get_screen_moment", "get_step", "get_work_map", "list_rules_for_step"]);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("tell the agent how to follow a map, naming no tool or workflow", async () => {
    const { client } = await connect(ownKey);
    const told = `${client.getInstructions()} ${(await client.listTools()).tools.map((tool) => tool.description).join(" ")}`;
    expect(told).toContain("get_work_map");
    // The same tripwire as for the agents' prompts: the words of the first demo workflow must not be in fixed text.
    expect(told).not.toMatch(/crystal|requirement|invoice/i);
  });
});

describe("a workflow's key", () => {
  it("loads the newest confirmed map of its workflow without naming it", async () => {
    const { call } = await connect(ownKey);
    const { answer } = await call("get_work_map");
    expect(latestWorkMap).toHaveBeenCalledWith(WORKFLOW_ID, true);
    expect(answer).toMatchObject({ work_map_id: MAP_ID, tool: "Order desk", task: "Review new orders", learned_from: "Order reviewer" });
    expect(answer.steps).toHaveLength(2);
    expect(answer.rules.map((rule: { number: number }) => rule.number)).toEqual([1, 2]);
  });

  it("is told when its workflow has no confirmed map yet", async () => {
    const { call } = await connect(ownKey);
    vi.mocked(latestWorkMap).mockResolvedValue({ ok: true, work_map: null });
    expect(await call("get_work_map")).toMatchObject({ refused: true, text: "This workflow has no confirmed Work Map yet." });
  });

  it("cannot read another workflow's map, and is told the same as for a map that does not exist", async () => {
    const { call } = await connect(otherKey);
    const other = await call("get_work_map", { work_map_id: MAP_ID });
    const none = await call("get_work_map", { work_map_id: "44444444-4444-4444-8444-444444444444" });
    expect(other.refused).toBe(true);
    expect(other.text).toBe(none.text);
    for (const tool of ["get_step", "list_rules_for_step"]) expect((await call(tool, { work_map_id: MAP_ID, position: 1 })).refused).toBe(true);
    expect((await call("get_rule", { work_map_id: MAP_ID, number: 1 })).refused).toBe(true);
    expect((await call("get_screen_moment", { work_map_id: MAP_ID, step: 1 })).refused).toBe(true);
  });

  it("cannot read a draft", async () => {
    const { call } = await connect(ownKey);
    vi.mocked(loadWorkMap).mockResolvedValue({ ok: true, work_map: { ...orderDesk, status: "draft" } });
    expect((await call("get_work_map", { work_map_id: MAP_ID })).refused).toBe(true);
  });

  it("is not asked the database about an id that is not one", async () => {
    const { call } = await connect(ownKey);
    expect((await call("get_work_map", { work_map_id: "1 or 1=1" })).refused).toBe(true);
    expect(loadWorkMap).not.toHaveBeenCalled();
  });
});

describe("the tutor", () => {
  it("reads any workflow's confirmed map by its id", async () => {
    const { call } = await connect(tutor);
    expect((await call("get_work_map", { work_map_id: MAP_ID })).answer.work_map_id).toBe(MAP_ID);
  });

  it("must say which map", async () => {
    const { call } = await connect(tutor);
    expect(await call("get_work_map")).toMatchObject({ refused: true, text: "Give the work_map_id." });
    expect(latestWorkMap).not.toHaveBeenCalled();
  });
});

describe("looking things up", () => {
  it("reads one step with its rules in full", async () => {
    const { call } = await connect(ownKey);
    const { answer } = await call("get_step", { position: 1 });
    expect(answer.step).toMatchObject({ position: 1, title: "Hold a large order", rules: [1, 2] });
    expect(answer.rules.map((rule: { statement: string }) => rule.statement)).toEqual(["Never release an order over 10,000.", "Rule 2."]);
  });

  it("says how many steps there are when asked for one too many", async () => {
    const { call } = await connect(ownKey);
    expect(await call("get_step", { position: 5 })).toMatchObject({ refused: true, text: "The map has no step 5. It has 2." });
  });

  it("lists a step's rules", async () => {
    const { call } = await connect(ownKey);
    expect((await call("list_rules_for_step", { position: 1 })).answer.rules).toHaveLength(2);
    expect((await call("list_rules_for_step", { position: 2 })).answer.rules).toEqual([]);
  });

  it("reads a rule by its number or its id, and needs one of them", async () => {
    const { call } = await connect(ownKey);
    expect((await call("get_rule", { number: 2 })).answer.rule.if_it_would_be_broken).toBe("escalate to finance lead");
    expect((await call("get_rule", { rule_id: orderDesk.rules[0].id })).answer.rule.number).toBe(1);
    expect((await call("get_rule")).refused).toBe(true);
    expect((await call("get_rule", { number: 3 })).refused).toBe(true);
  });

  it("shows the expert's screen behind a step, with the picture's address", async () => {
    const { call } = await connect(ownKey);
    const { answer } = await call("get_screen_moment", { step: 1 });
    expect(answer).toMatchObject({ step: 1, what_happened: 'Pressed "Hold" on Order 1.', picture: "https://pictures.example/frame-1.jpg", personal_fields_left_out: 0 });
    expect(answer.screen.fields).toHaveLength(2);
  });

  it("says whether a rule was said at its moment or later", async () => {
    const { call } = await connect(ownKey);
    expect((await call("get_screen_moment", { rule: 1 })).answer.said).toBe("at this moment");
    expect((await call("get_screen_moment", { rule: 2 })).answer.said).toBe("about this moment, later");
  });

  it("leaves a field marked as personal data out of the words", async () => {
    const { call } = await connect(ownKey);
    vi.mocked(loadToolMap).mockResolvedValue(toolMap(["Customer"]));
    const { answer, text } = await call("get_screen_moment", { step: 1 });
    expect(answer.personal_fields_left_out).toBe(1);
    expect(text).not.toContain("Northwind");
  });

  it("says nothing about a screen when it cannot tell what is personal", async () => {
    const { call } = await connect(ownKey);
    vi.mocked(loadToolMap).mockResolvedValue({ ok: false, reason: "unavailable" });
    const shown = await call("get_screen_moment", { step: 1 });
    expect(shown.refused).toBe(true);
    expect(shown.text).not.toContain("Northwind");
  });

  it("needs a step or a rule, not both and not neither", async () => {
    const { call } = await connect(ownKey);
    expect((await call("get_screen_moment")).refused).toBe(true);
    expect((await call("get_screen_moment", { step: 1, rule: 1 })).refused).toBe(true);
    expect((await call("get_screen_moment", { step: 2 })).refused).toBe(true);
  });

  it("asks to try again when the map cannot be read", async () => {
    const { call } = await connect(ownKey);
    vi.mocked(loadWorkMap).mockResolvedValue({ ok: false, reason: "unavailable" });
    expect((await call("get_step", { work_map_id: MAP_ID, position: 1 })).text).toMatch(/Try again/);
  });
});
