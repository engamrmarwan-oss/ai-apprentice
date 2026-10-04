-- Role links are replaced by sign-in (see the accounts migration). No session
-- was ever started from one, and the two links that existed stop working.
alter table public.sessions drop column role_link_id;
drop table public.role_links;
