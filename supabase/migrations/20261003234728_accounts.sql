-- Accounts. People sign in with an email and a password; Supabase Auth holds
-- the password. An account has no role of its own: a role belongs to a
-- workflow. Whoever creates a workflow is its expert, and the people the
-- expert invites are its new hires.
--
-- As everywhere else, row-level security is on with no policies: only route
-- handlers, through the server's key, read or write these tables.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Lower case. Copied from the account so people can be listed and found by email.
  email text not null unique check (email = lower(email)),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

-- A signed-in browser. The cookie holds a random token; only its hash is stored.
create table public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index auth_sessions_user_id_idx on public.auth_sessions (user_id);

-- Codes that allow a person to sign up. Only the hash is stored.
create table public.signup_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Who is on a workflow, and as what.
create table public.workflow_members (
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('expert', 'new_hire')),
  created_at timestamptz not null default now(),
  primary key (workflow_id, user_id)
);
create index workflow_members_user_id_idx on public.workflow_members (user_id);

-- People invited to a workflow who have no account yet. An invitation is
-- taken up, and removed, when someone signs up with that email.
create table public.workflow_invitations (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'new_hire' check (role in ('expert', 'new_hire')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workflow_id, email)
);
create index workflow_invitations_email_idx on public.workflow_invitations (email);

-- Who ran a session.
alter table public.sessions add column user_id uuid references public.profiles (id) on delete set null;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'auth_sessions', 'signup_codes', 'workflow_members', 'workflow_invitations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
