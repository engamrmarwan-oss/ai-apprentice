-- A signed-in browser belongs to a profile, so one read answers "who is this?".
alter table public.auth_sessions drop constraint auth_sessions_user_id_fkey;
alter table public.auth_sessions
  add constraint auth_sessions_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
