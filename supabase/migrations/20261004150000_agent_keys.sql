-- Keys that let an agent outside Tiro read one workflow's confirmed Work Maps
-- through Tiro's MCP server. The expert creates a key and can withdraw it.
-- Only the hash is stored; `hint` is the key's last characters, so the expert
-- can tell their keys apart.
create table public.agent_keys (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique,
  hint text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index agent_keys_workflow_id_idx on public.agent_keys (workflow_id);

alter table public.agent_keys enable row level security;
revoke all on table public.agent_keys from anon, authenticated;
grant all on table public.agent_keys to service_role;
