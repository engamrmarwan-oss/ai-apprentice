-- The name a screen was read under. The expert may rename a screen in the map
-- review; what Tiro reads later must still be matched to it, not added again
-- under its old name.
alter table public.tool_screens add column seen_as text;
update public.tool_screens set seen_as = name where seen_as is null;
