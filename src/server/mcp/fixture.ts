// A made-up confirmed Work Map for the MCP tests: an order desk that has
// nothing to do with any real tool.
import type { Moment, WorkMapRule, WorkMapView } from "../workmap/maps";

const moment = (n: number, what: string): Moment => ({
  event_id: `event-${n}`,
  frame_id: `frame-${n}`,
  t_ms: 65_000 * n,
  what,
  picture: `https://pictures.example/frame-${n}.jpg`,
  screen: {
    name: "Order",
    item: `Order ${n}`,
    fields: [
      { name: "Amount", value: "12,400.00" },
      { name: "Customer", value: "Northwind" },
    ],
  },
});

const rule = (number: number, change: Partial<WorkMapRule>): WorkMapRule => ({
  id: `00000000-0000-4000-8000-00000000000${number}`,
  number,
  lineage_id: `lineage-${number}`,
  version: 1,
  kind: "limit",
  statement: `Rule ${number}.`,
  quote: { utterance_id: `said-${number}`, text: `What the expert said about rule ${number}.` },
  moment: { ...moment(1, 'Pressed "Hold" on Order 1.'), link: "direct" },
  action: { type: "block" },
  status: "confirmed",
  provenance: "observed",
  documented: false,
  check_type: "judged",
  condition: null,
  history: [],
  steps: [1],
  ...change,
});

export const MAP_ID = "11111111-1111-4111-8111-111111111111";
export const WORKFLOW_ID = "22222222-2222-4222-8222-222222222222";

export const orderDesk: WorkMapView = {
  id: MAP_ID,
  workflow_id: WORKFLOW_ID,
  session_id: "session-1",
  version: 2,
  status: "confirmed",
  created_at: "2026-10-04T10:00:00Z",
  confirmed_at: "2026-10-04T11:00:00Z",
  steps: [
    {
      id: "step-1",
      position: 1,
      title: "Hold a large order",
      decision: "Held the order for finance.",
      is_judgment: true,
      reason: { utterance_id: "said-9", text: "Finance has to look at anything this large." },
      moment: moment(1, 'Pressed "Hold" on Order 1.'),
      rules: [1, 2, 3],
    },
    {
      id: "step-2",
      position: 2,
      title: "Release the rest",
      decision: "Released the order.",
      is_judgment: false,
      reason: null,
      moment: null,
      rules: [],
    },
  ],
  rules: [
    rule(1, { statement: "Never release an order over 10,000.", status: "corrected", documented: true }),
    rule(2, { kind: "stop_and_ask", action: { type: "escalate", role: "finance lead" }, moment: { ...moment(2, "Opened Order 2."), link: "related" } }),
    // Never confirmed by the expert: it is not taught and not exported.
    rule(3, { status: "candidate" }),
  ],
};
