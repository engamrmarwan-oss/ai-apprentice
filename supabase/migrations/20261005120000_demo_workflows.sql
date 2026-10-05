-- A demo workflow is one every account is put on as a new hire, so that
-- someone who has just signed up has a confirmed Work Map to look at and a
-- lesson to take. Which workflows are demos is data.
alter table public.workflows add column is_demo boolean not null default false;
