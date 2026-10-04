-- Capture (design section 13, phase 2).

-- What the reader saw on a frame: the screen, the item, its fields and the
-- events it reported. The next frame is read against it. Null when the frame
-- could not be read.
alter table public.frames add column reading jsonb;

-- The frame's size in pixels, so a screen can lay it out and place its
-- changed region before the picture has loaded.
alter table public.frames add column width integer check (width > 0);
alter table public.frames add column height integer check (height > 0);

-- The voice conversation a session runs in, as ElevenLabs names it. Key
-- frames are uploaded to it, and it is what has to be removed there when a
-- stretch goes off the record.
alter table public.sessions add column conversation_id text;
