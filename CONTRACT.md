# Tiro contract

**Status: DRAFT. Not frozen.** It becomes frozen when Amr approves it. After that it changes only with his agreement, and `src/contract/` changes in the same commit.

This is the shape of the three records both builders code against: events, questions and rules. The executable form is the Zod schemas in `src/contract/`; `src/contract/contract.test.ts` checks them. If this file and the schemas disagree, that is a bug.

## Open points

The design leaves these open. The draft uses the default shown. Each needs Amr's yes or a correction before the freeze.

| # | Open point | Default used here |
|---|---|---|
| 1 | A rule the expert only described (an unseen case) has no screen moment of its own | It links to the nearest related event, with `screen_moment.link` set to `related` |
| 2 | Which row carries the status `corrected` | One row per version, joined by `lineage_id`. The new version becomes `corrected` once re-confirmed; the old one becomes `retired` |
| 3 | What a `condition` means | The rule's action fires when the condition is true |
| 4 | Which operators a `condition` may use | Exactly the eight in the design. No `not`, no `gte`, no `lte` |
| 5 | Which kinds count as guardrails | `limit`, `exception`, `stop_and_ask`, flagged in data, not in code |
| 6 | Event payloads per type (the design names the types only) | As listed under Event |
| 7 | Question statuses (the design names the field only) | `queued`, `asked`, `answered`, `dropped`, plus a `channel` |
| 8 | Shape of a rule check result (the design says only that both check types share one) | As listed under Rule check result |

## Conventions

- Ids are UUIDs.
- `t_ms` is milliseconds since the session started. It is the one clock for events, frames and utterances.
- Text read from the screen (screen names, field names, values, button labels) is stored as shown. Code compares it and never interprets it. Nothing in the contract names a workflow, a tool or a domain term.
- `null` means "not known" or "not applicable". Fields are never omitted.

## Event

One observed change on screen.

| Field | Type | Meaning |
|---|---|---|
| `id` | id | |
| `session_id` | id | |
| `type` | one of the seven types below | |
| `t_ms` | integer ≥ 0 | When the settled frame was captured |
| `confidence` | number 0–1 | The reading model's confidence |
| `verified` | boolean | Set by the strong-model pass at the debrief. Only verified events feed the Work Map |
| `frame_id` | id | The settled frame the event was read from |
| `screen_id` | id or null | Tool map screen. Null while reading with an open vocabulary |
| `element_id` | id or null | Tool map element involved |
| `payload` | object | Depends on `type` |

`commit` and `status_change` are **decision events**. Only they can open the floor.

| Type | Payload |
|---|---|
| `navigate` | `from_screen` (text or null), `to_screen` (text) |
| `open_item` | `item` (text) |
| `field_change` | `item` (text or null), `field` (text), `from` (text or null), `to` (text or null) |
| `status_change` | `item` (text or null), `field` (text), `from` (text or null), `to` (text) |
| `text_edit` | `item` (text or null), `field` (text), `before` (text or null), `after` (text) |
| `dialog` | `title` (text or null), `text` (text) |
| `commit` | `item` (text or null), `action` (text: the label of the control that committed) |

`item` is the unit of work on screen, as the tool labels it.

## Question

One question Tiro wants to ask the expert.

| Field | Type | Meaning |
|---|---|---|
| `id` | id | |
| `session_id` | id | |
| `text` | text | The question as it will be spoken |
| `kind` | one of the seven kinds below | |
| `trigger_event_id` | id or null | The event that prompted it. Null when it comes from the baseline alone |
| `baseline_statement_id` | id or null | The baseline statement it is about, if any |
| `score` | number 0–1 | The planner's score |
| `status` | `queued`, `asked`, `answered`, `dropped` | A question is **open** while `queued` or `asked` |
| `channel` | `live` or `debrief` | Where it is asked. Live questions that overflow the budget move to `debrief` |
| `answer_utterance_id` | id or null | The expert's answer |

| Kind | Asked when |
|---|---|
| `reason` | Why this step or decision |
| `limit` | Is there a threshold |
| `exception` | When does the usual way not apply |
| `stop_and_ask` | When would you stop and ask someone |
| `deviation` | The expert did something the baseline did not predict |
| `alternative` | The tool map shows an option the expert did not take |
| `confirm_reading` | Tiro read the screen with low confidence |

The question kinds are a fixed list. The debrief ends when no question is open and the expert has confirmed the Work Map.

## Rule

A guardrail or judgment captured from the expert. One row per version.

| Field | Type | Meaning |
|---|---|---|
| `id` | id | This version |
| `lineage_id` | id | The same across every version of one rule |
| `version` | integer ≥ 1 | Incremented on every change. Old versions are retired, never deleted |
| `work_map_id` | id | |
| `kind` | text | A key in the `rule_kinds` table. Seeded with `limit`, `exception`, `stop_and_ask`, `never`, `judgment`; extensible per workflow |
| `statement` | text | The rule in plain language |
| `expert_quote` | `{ utterance_id }` | The expert's own words |
| `screen_moment` | `{ event_id, frame_id, link }` | `link` is `direct` (the rule was applied at this moment) or `related` (the nearest moment to a rule the expert only described) |
| `check_type` | `deterministic` or `judged` | |
| `condition` | condition or null | Required for deterministic rules, null for judged ones |
| `judge_spec` | judge spec or null | Required for judged rules, null for deterministic ones |
| `action` | `{ type }` | `block`, `warn`, `ask`, or `escalate` with a `role` |
| `status` | `candidate`, `confirmed`, `corrected`, `rejected`, `retired` | |
| `provenance` | `observed`, `live_question`, `debrief`, `baseline_confirmed` | Where the rule came from |
| `documented` | boolean | True when the baseline already contained it |

### Condition

A small JSON expression over tool-map elements. The rule's action fires when it is true.

```
condition :=
    { "all": [condition, ...] }          every one is true
  | { "any": [condition, ...] }          at least one is true
  | { "eq":  [element, value] }
  | { "neq": [element, value] }
  | { "gt":  [element, number] }
  | { "lt":  [element, number] }
  | { "in":  [element, [value, ...]] }
  | { "empty": element }

element := { "element": <tool_elements id> }
value   := text | number | boolean
```

A condition must reference elements that exist in the tool map. A rule whose condition cannot do so becomes `judged`.

### Judge spec

| Field | Type | Meaning |
|---|---|---|
| `question` | text | What the judge evaluates |
| `reasoning` | text | The expert's reasoning, in the expert's words |
| `examples` | list of `{ event_id, utterance_id or null, note }` | Moments from the session that show the rule applied |

### Rule check result

Both check types return this, so the tutor does not care which one fired.

| Field | Type | Meaning |
|---|---|---|
| `rule_id` | id | |
| `rule_version` | integer | |
| `check_type` | `deterministic` or `judged` | |
| `outcome` | `fired`, `clear`, `unknown` | `unknown`: it could not be evaluated, because an element was not on screen or the judge call failed soft |
| `action` | action or null | The rule's action when it fired |
| `explanation` | text or null | Why, in words the tutor can use. Null for deterministic rules |
