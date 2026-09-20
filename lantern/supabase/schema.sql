-- =====================================================================
-- LANTERN — incident reports table for Supabase (Postgres)
-- Run this once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run more than once.
-- =====================================================================

create table if not exists public.incident_reports (
  id             bigint generated always as identity primary key,

  -- Which street segment the report is about. LANTERN's demo street grid
  -- names its segments e0, e1, e2 ... (see js/data.js).
  route_segment  text        not null check (route_segment ~ '^e[0-9]{1,3}$'),
  segment_name   text        check (char_length(segment_name) <= 80),

  severity       smallint    not null check (severity between 1 and 3),   -- 1 minor, 2 moderate, 3 severe

  -- The hour of day (0-23) the report applies to. The safety model weights
  -- a report by how close this hour is to the hour you are travelling.
  incident_hour  smallint    not null check (incident_hour between 0 and 23),

  reported_at    timestamptz not null default now(),   -- when the user filed the report

  -- Optional. Unused while the map is a synthetic grid; kept for a future
  -- real-map version.
  latitude       double precision check (latitude  between  -90 and  90),
  longitude      double precision check (longitude between -180 and 180),

  created_at     timestamptz not null default now()    -- when the row was inserted
);

create index if not exists incident_reports_segment_idx
  on public.incident_reports (route_segment);

-- ---------------------------------------------------------------------
-- Row Level Security
-- The browser uses the PUBLIC key, so this is what actually protects the
-- table. Visitors may read reports and add new ones. There is no update or
-- delete policy, so those are denied.
-- ---------------------------------------------------------------------
alter table public.incident_reports enable row level security;

drop policy if exists "Anyone can read incident reports"   on public.incident_reports;
drop policy if exists "Anyone can submit incident reports" on public.incident_reports;

create policy "Anyone can read incident reports"
  on public.incident_reports for select
  to anon, authenticated
  using (true);

create policy "Anyone can submit incident reports"
  on public.incident_reports for insert
  to anon, authenticated
  with check (true);
