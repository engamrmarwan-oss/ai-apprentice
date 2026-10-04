import type { Rule, TiroEvent } from "@/contract";
import type { Tables } from "@/contract/database.types";
import type { WorkMapFixture, WorkMapStepItem } from "@/components/work-map/types";

const workMapId = "00000000-0000-4000-8000-000000000101";
const sessionId = "00000000-0000-4000-8000-000000000102";

const workMap: Tables<"work_maps"> = {
  confirmed_at: "2026-10-04T10:04:00Z",
  created_at: "2026-10-04T09:58:00Z",
  id: workMapId,
  session_id: sessionId,
  status: "confirmed",
  version: 2,
  workflow_id: "00000000-0000-4000-8000-000000000103",
};

const rules: Rule[] = [
  {
    action: { type: "ask" },
    check_type: "judged",
    condition: null,
    documented: false,
    expert_quote: { utterance_id: "00000000-0000-4000-8000-000000000401" },
    id: "00000000-0000-4000-8000-000000000501",
    judge_spec: {
      examples: [
        {
          event_id: "00000000-0000-4000-8000-000000000301",
          note: "The supplier was not in the approved list, so the expert paused for review.",
          utterance_id: "00000000-0000-4000-8000-000000000401",
        },
      ],
      question: "Is this supplier already approved for this type of purchase?",
      reasoning: "A new supplier needs a person to check ownership and payment details before approval.",
    },
    kind: "stop_and_ask",
    lineage_id: "00000000-0000-4000-8000-000000000601",
    provenance: "debrief",
    screen_moment: {
      event_id: "00000000-0000-4000-8000-000000000301",
      frame_id: "00000000-0000-4000-8000-000000000201",
      link: "direct",
    },
    statement: "Ask the accounts payable lead before approving a new supplier.",
    status: "corrected",
    version: 2,
    work_map_id: workMapId,
  },
  {
    action: { type: "block" },
    check_type: "deterministic",
    condition: {
      gt: [{ element: "00000000-0000-4000-8000-000000000701" }, 10],
    },
    documented: true,
    expert_quote: { utterance_id: "00000000-0000-4000-8000-000000000402" },
    id: "00000000-0000-4000-8000-000000000502",
    judge_spec: null,
    kind: "limit",
    lineage_id: "00000000-0000-4000-8000-000000000602",
    provenance: "baseline_confirmed",
    screen_moment: {
      event_id: "00000000-0000-4000-8000-000000000302",
      frame_id: "00000000-0000-4000-8000-000000000202",
      link: "direct",
    },
    statement: "Do not approve an invoice when its total differs from the purchase order by more than 10%.",
    status: "confirmed",
    version: 1,
    work_map_id: workMapId,
  },
  {
    action: { role: "Accounts payable lead", type: "escalate" },
    check_type: "judged",
    condition: null,
    documented: false,
    expert_quote: { utterance_id: "00000000-0000-4000-8000-000000000403" },
    id: "00000000-0000-4000-8000-000000000503",
    judge_spec: {
      examples: [
        {
          event_id: "00000000-0000-4000-8000-000000000303",
          note: "The expert escalated an invoice with conflicting payment instructions.",
          utterance_id: "00000000-0000-4000-8000-000000000403",
        },
      ],
      question: "Do the invoice and supplier record contain conflicting payment instructions?",
      reasoning: "Conflicting payment instructions can indicate a mistake or fraud and need a second review.",
    },
    kind: "exception",
    lineage_id: "00000000-0000-4000-8000-000000000603",
    provenance: "observed",
    screen_moment: {
      event_id: "00000000-0000-4000-8000-000000000303",
      frame_id: "00000000-0000-4000-8000-000000000203",
      link: "direct",
    },
    statement: "Escalate when the invoice and supplier record show different payment instructions.",
    status: "confirmed",
    version: 1,
    work_map_id: workMapId,
  },
];

const oldSupplierRule: Rule = {
  ...rules[0],
  id: "00000000-0000-4000-8000-000000000504",
  statement: "Pause when a supplier looks unfamiliar.",
  status: "candidate",
  version: 1,
};

function event(
  id: string,
  frameId: string,
  tMs: number,
  type: TiroEvent["type"],
  payload: TiroEvent["payload"],
): TiroEvent {
  return {
    confidence: 0.96,
    element_id: null,
    frame_id: frameId,
    id,
    payload,
    screen_id: null,
    session_id: sessionId,
    t_ms: tMs,
    type,
    verified: true,
  } as TiroEvent;
}

function frame(
  id: string,
  tMs: number,
  screen: string,
  item: string,
  fields: Array<{ name: string; value: string }>,
): Tables<"frames"> {
  return {
    changed_region: null,
    created_at: "2026-10-04T09:00:00Z",
    height: 720,
    id,
    is_key: true,
    reading: { fields, item, screen },
    redacted: false,
    session_id: sessionId,
    storage_path: `fixtures/three-invoices/${id}.webp`,
    t_ms: tMs,
    width: 1280,
  };
}

function utterance(id: string, startMs: number, text: string): Tables<"utterances"> {
  return {
    created_at: "2026-10-04T09:00:00Z",
    end_ms: startMs + 4200,
    id,
    language: "en",
    session_id: sessionId,
    speaker: "expert",
    start_ms: startMs,
    text_english: text,
    text_original: text,
  };
}

function step(
  row: Tables<"steps">,
  related: Omit<WorkMapStepItem, "step">,
): WorkMapStepItem {
  return { step: row, ...related };
}

const steps: WorkMapStepItem[] = [
  step(
    {
      created_at: "2026-10-04T09:58:00Z",
      decision: "Choose the next invoice and establish whether it needs extra review.",
      event_id: "00000000-0000-4000-8000-000000000301",
      frame_id: "00000000-0000-4000-8000-000000000201",
      id: "00000000-0000-4000-8000-000000000801",
      is_judgment: true,
      position: 1,
      reason_utterance_id: "00000000-0000-4000-8000-000000000401",
      title: "Open the next invoice",
      work_map_id: workMapId,
    },
    {
      event: event(
        "00000000-0000-4000-8000-000000000301",
        "00000000-0000-4000-8000-000000000201",
        18000,
        "open_item",
        { item: "Invoice 1 of 3" },
      ),
      frame: frame(
        "00000000-0000-4000-8000-000000000201",
        18000,
        "Invoice detail",
        "Invoice 1 of 3",
        [
          { name: "Supplier", value: "Northstar Office Supply" },
          { name: "Total", value: "$4,860.00" },
          { name: "Purchase order", value: "PO-1842" },
        ],
      ),
      reason: utterance(
        "00000000-0000-4000-8000-000000000401",
        19500,
        "I stop on a supplier I have not seen before, even when the amount looks normal, because the payment details need another pair of eyes.",
      ),
      rules: [rules[0]],
    },
  ),
  step(
    {
      created_at: "2026-10-04T09:59:00Z",
      decision: "Compare the invoice total with the purchase order before choosing an outcome.",
      event_id: "00000000-0000-4000-8000-000000000302",
      frame_id: "00000000-0000-4000-8000-000000000202",
      id: "00000000-0000-4000-8000-000000000802",
      is_judgment: true,
      position: 2,
      reason_utterance_id: "00000000-0000-4000-8000-000000000402",
      title: "Compare invoice and purchase order",
      work_map_id: workMapId,
    },
    {
      event: event(
        "00000000-0000-4000-8000-000000000302",
        "00000000-0000-4000-8000-000000000202",
        46000,
        "status_change",
        { field: "Review", from: "Open", item: "Invoice 2 of 3", to: "Needs review" },
      ),
      frame: frame(
        "00000000-0000-4000-8000-000000000202",
        46000,
        "Invoice detail",
        "Invoice 2 of 3",
        [
          { name: "Supplier", value: "Citywide Paper Co." },
          { name: "Invoice total", value: "$9,920.00" },
          { name: "PO total", value: "$8,600.00" },
        ],
      ),
      reason: utterance(
        "00000000-0000-4000-8000-000000000402",
        47000,
        "The difference is over ten percent, so I do not approve it. That is the point where the buyer has to explain the change.",
      ),
      rules: [rules[1]],
    },
  ),
  step(
    {
      created_at: "2026-10-04T10:00:00Z",
      decision: "Approve a clean match or send an exception to the right reviewer.",
      event_id: "00000000-0000-4000-8000-000000000303",
      frame_id: "00000000-0000-4000-8000-000000000203",
      id: "00000000-0000-4000-8000-000000000803",
      is_judgment: true,
      position: 3,
      reason_utterance_id: "00000000-0000-4000-8000-000000000403",
      title: "Approve or escalate",
      work_map_id: workMapId,
    },
    {
      event: event(
        "00000000-0000-4000-8000-000000000303",
        "00000000-0000-4000-8000-000000000203",
        79000,
        "commit",
        { action: "Escalate", item: "Invoice 3 of 3" },
      ),
      frame: frame(
        "00000000-0000-4000-8000-000000000203",
        79000,
        "Invoice detail",
        "Invoice 3 of 3",
        [
          { name: "Supplier", value: "Harbor Facilities" },
          { name: "Invoice bank", value: "•••• 6204" },
          { name: "Supplier bank", value: "•••• 1738" },
        ],
      ),
      reason: utterance(
        "00000000-0000-4000-8000-000000000403",
        80500,
        "These payment details do not match the supplier record. I escalate rather than guessing, because that can be a genuine change or a fraud risk.",
      ),
      rules: [rules[2]],
    },
  ),
];

export const workMapFixture: WorkMapFixture = {
  ruleHistory: {
    [rules[0].lineage_id]: [oldSupplierRule, rules[0]],
    [rules[1].lineage_id]: [rules[1]],
    [rules[2].lineage_id]: [rules[2]],
  },
  steps,
  workMap,
};
