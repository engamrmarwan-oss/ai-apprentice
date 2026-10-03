-- Tiro foundation schema (solution design, section 6).
--
-- All access goes through server route handlers using the secret key.
-- Row-level security is on for every table and there are no policies, so the
-- public keys can read and write nothing.
--
-- Nothing here names a workflow, a tool or a domain term: those are rows.

-- ---------------------------------------------------------------------------
-- Tool map
-- ---------------------------------------------------------------------------

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text,
  created_at timestamptz not null default now()
);

create table public.tool_screens (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools (id) on delete cascade,
  name text not null,
  url_pattern text,
  origin text not null check (origin in ('crawled', 'scanned', 'seen_live')),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tool_elements (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references public.tool_screens (id) on delete cascade,
  kind text not null check (kind in ('field', 'button', 'status')),
  label text not null,
  -- The values the element can take, as a JSON array of text, when the tool limits them.
  allowed_values jsonb,
  -- Personal data: blurred in every recording.
  personal boolean not null default false,
  origin text not null check (origin in ('crawled', 'scanned', 'seen_live')),
  -- Where the element sits on its screen, used to blur it before upload.
  region jsonb,
  created_at timestamptz not null default now()
);

create table public.crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  stats jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Workflows and their baseline
-- ---------------------------------------------------------------------------

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools (id) on delete restrict,
  task text not null,
  role text,
  -- Per-workflow settings: floor thresholds, question budget, guardrail question kinds.
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.baseline_statements (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  text text not null,
  source text not null check (
    source in ('uploaded_process', 'tool_map', 'onet', 'model_knowledge', 'web_search', 'previous_work_map')
  ),
  source_detail text,
  status text not null default 'assumed' check (
    status in ('assumed', 'confirmed', 'contradicted', 'not_observed')
  ),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access: one link per role, no accounts
-- ---------------------------------------------------------------------------

create table public.role_links (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('expert', 'new_hire')),
  -- SHA-256 of the token. The token itself is never stored.
  token_hash text not null unique,
  label text,
  -- Optional: limits the link to one workflow.
  workflow_id uuid references public.workflows (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Sessions and what they record
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  kind text not null check (kind in ('expert', 'tutor')),
  language text not null default 'en',
  phase text not null default 'setup' check (phase in ('setup', 'capture', 'debrief', 'teach', 'ended')),
  -- The role link the session was started from.
  role_link_id uuid references public.role_links (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table public.frames (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  t_ms integer not null check (t_ms >= 0),
  storage_path text not null,
  changed_region jsonb,
  is_key boolean not null default false,
  redacted boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  key_frame_id uuid references public.frames (id) on delete set null,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  check (end_ms > start_ms)
);

-- Shape defined in CONTRACT.md.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  type text not null check (
    type in ('navigate', 'open_item', 'field_change', 'status_change', 'text_edit', 'dialog', 'commit')
  ),
  t_ms integer not null check (t_ms >= 0),
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  verified boolean not null default false,
  frame_id uuid not null references public.frames (id) on delete cascade,
  screen_id uuid references public.tool_screens (id) on delete set null,
  element_id uuid references public.tool_elements (id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.utterances (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  speaker text not null check (speaker in ('expert', 'new_hire', 'agent')),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  language text,
  text_original text not null,
  text_english text,
  created_at timestamptz not null default now(),
  check (end_ms >= start_ms)
);

-- Off-the-record gap markers: what is left after a stretch is deleted.
create table public.redactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  created_at timestamptz not null default now(),
  check (end_ms >= start_ms)
);

-- Shape defined in CONTRACT.md.
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  text text not null check (length(text) > 0),
  kind text not null check (
    kind in ('reason', 'limit', 'exception', 'stop_and_ask', 'deviation', 'alternative', 'confirm_reading')
  ),
  trigger_event_id uuid references public.events (id) on delete set null,
  baseline_statement_id uuid references public.baseline_statements (id) on delete set null,
  score double precision not null check (score >= 0 and score <= 1),
  status text not null default 'queued' check (status in ('queued', 'asked', 'answered', 'dropped')),
  channel text not null check (channel in ('live', 'debrief')),
  answer_utterance_id uuid references public.utterances (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Work Map
-- ---------------------------------------------------------------------------

-- One row per version of a workflow's Work Map.
create table public.work_maps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete restrict,
  version integer not null check (version >= 1),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (workflow_id, version)
);

-- Evidence columns are nullable while a map is a draft. The validator, in code,
-- refuses to confirm a map until every step has an event, a frame and a reason.
create table public.steps (
  id uuid primary key default gen_random_uuid(),
  work_map_id uuid not null references public.work_maps (id) on delete cascade,
  position integer not null check (position >= 1),
  title text not null,
  decision text,
  reason_utterance_id uuid references public.utterances (id) on delete restrict,
  event_id uuid references public.events (id) on delete restrict,
  frame_id uuid references public.frames (id) on delete restrict,
  is_judgment boolean not null default false,
  created_at timestamptz not null default now(),
  unique (work_map_id, position)
);

-- Rule kinds are data. A null workflow means the kind is available everywhere.
create table public.rule_kinds (
  key text primary key,
  label text not null,
  -- Guardrail kinds are the ones the question planner must cover in a live session.
  is_guardrail boolean not null default false,
  workflow_id uuid references public.workflows (id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.rule_kinds (key, label, is_guardrail) values
  ('limit', 'Limit', true),
  ('exception', 'Exception', true),
  ('stop_and_ask', 'Stop and ask', true),
  ('never', 'Never', false),
  ('judgment', 'Judgment', false);

-- Shape defined in CONTRACT.md. One row per version; `lineage_id` joins the versions of one rule.
create table public.rules (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null,
  version integer not null check (version >= 1),
  work_map_id uuid not null references public.work_maps (id) on delete cascade,
  kind text not null references public.rule_kinds (key) on update cascade on delete restrict,
  statement text not null check (length(statement) > 0),
  expert_quote_utterance_id uuid not null references public.utterances (id) on delete restrict,
  moment_event_id uuid not null references public.events (id) on delete restrict,
  moment_frame_id uuid not null references public.frames (id) on delete restrict,
  moment_link text not null check (moment_link in ('direct', 'related')),
  check_type text not null check (check_type in ('deterministic', 'judged')),
  condition jsonb,
  judge_spec jsonb,
  action jsonb not null,
  status text not null default 'candidate' check (
    status in ('candidate', 'confirmed', 'corrected', 'rejected', 'retired')
  ),
  provenance text not null check (
    provenance in ('observed', 'live_question', 'debrief', 'baseline_confirmed')
  ),
  documented boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lineage_id, version),
  check (
    (check_type = 'deterministic' and condition is not null and judge_spec is null)
    or (check_type = 'judged' and judge_spec is not null and condition is null)
  )
);

create table public.rule_links (
  rule_id uuid not null references public.rules (id) on delete cascade,
  step_id uuid not null references public.steps (id) on delete cascade,
  primary key (rule_id, step_id)
);

-- ---------------------------------------------------------------------------
-- Teaching
-- ---------------------------------------------------------------------------

create table public.tutor_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  -- A work_maps row is one version, so this pins the version that was taught.
  work_map_id uuid not null references public.work_maps (id) on delete restrict,
  case_label text,
  created_at timestamptz not null default now()
);

create table public.tutor_checks (
  id uuid primary key default gen_random_uuid(),
  tutor_run_id uuid not null references public.tutor_runs (id) on delete cascade,
  rule_id uuid not null references public.rules (id) on delete restrict,
  prediction text,
  outcome text not null check (
    outcome in ('passed_first_time', 'needed_hint', 'violated', 'not_encountered')
  ),
  caught_before_commit boolean,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Evaluation: the expert's private answer key, in its own schema.
-- Only the evaluation route may read it; it never enters a capture, debrief
-- or tutor prompt.
-- ---------------------------------------------------------------------------

create schema evaluation;

create table evaluation.evaluation_sets (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table evaluation.evaluation_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references evaluation.evaluation_sets (id) on delete cascade,
  kind text references public.rule_kinds (key) on update cascade on delete set null,
  statement text not null check (length(statement) > 0),
  created_at timestamptz not null default now()
);

create table evaluation.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references evaluation.evaluation_sets (id) on delete cascade,
  work_map_id uuid not null references public.work_maps (id) on delete cascade,
  -- Null when the rule was invented: nothing in the answer key matches it.
  item_id uuid references evaluation.evaluation_items (id) on delete cascade,
  -- Null when the item was missed: no captured rule matches it.
  rule_id uuid references public.rules (id) on delete set null,
  verdict text not null check (verdict in ('captured', 'missed', 'invented')),
  -- Where the captured rule came from: watching, a live question or the debrief.
  provenance text,
  created_at timestamptz not null default now(),
  check (item_id is not null or rule_id is not null)
);

-- ---------------------------------------------------------------------------
-- Indexes for the reads the pipeline makes most
-- ---------------------------------------------------------------------------

create index tool_screens_tool_id_idx on public.tool_screens (tool_id);
create index tool_elements_screen_id_idx on public.tool_elements (screen_id);
create index baseline_statements_workflow_id_idx on public.baseline_statements (workflow_id);
create index sessions_workflow_id_idx on public.sessions (workflow_id);
create index frames_session_time_idx on public.frames (session_id, t_ms);
create index events_session_time_idx on public.events (session_id, t_ms);
create index utterances_session_time_idx on public.utterances (session_id, start_ms);
create index questions_session_status_idx on public.questions (session_id, status);
create index steps_work_map_id_idx on public.steps (work_map_id);
create index rules_work_map_id_idx on public.rules (work_map_id);
create index tutor_checks_run_id_idx on public.tutor_checks (tutor_run_id);
create index evaluation_items_set_id_idx on evaluation.evaluation_items (set_id);
create index evaluation_results_set_id_idx on evaluation.evaluation_results (set_id);

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------

-- The public keys get nothing, now or for tables added later.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on schema evaluation from anon, authenticated;

-- The server's secret key gets everything.
grant all on all tables in schema public to service_role;
grant usage on schema evaluation to service_role;
grant all on all tables in schema evaluation to service_role;
alter default privileges in schema evaluation grant all on tables to service_role;

-- Row-level security on every table, with no policies.
do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename
    from pg_tables
    where schemaname in ('public', 'evaluation')
  loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Storage: private buckets for frames and clips
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('frames', 'frames', false),
  ('clips', 'clips', false)
on conflict (id) do nothing;
