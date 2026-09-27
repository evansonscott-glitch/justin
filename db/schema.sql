-- Justin v0 schema (brief §5). Idempotent: safe to re-run.
create extension if not exists postgis;
create extension if not exists vector;

create table if not exists projects (
  id text primary key,                 -- JustServe project id
  url text not null,
  title text,
  org_name text,
  description text,
  address text,
  city text,
  geo geography(point),
  starts_at timestamptz,
  ends_at timestamptz,
  recurring boolean,
  capacity int,
  spots_left int,
  raw jsonb,                           -- original record
  content_hash text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  source text not null default 'justserve' check (source in ('justserve', 'sample')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists projects_geo_idx on projects using gist (geo);
create index if not exists projects_status_idx on projects (status);
create index if not exists projects_fts_idx on projects using gin (
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(org_name,'') || ' ' || coalesce(description,''))
);

create table if not exists project_tags (
  project_id text primary key references projects(id) on delete cascade,
  min_age int,
  family_friendly boolean,
  setting text check (setting in ('indoor', 'outdoor', 'both', 'unknown')),
  group_min int,
  group_max int,
  effort text check (effort in ('light', 'moderate', 'heavy')),
  time_of_day text check (time_of_day in ('morning', 'afternoon', 'evening', 'flexible')),
  weekday boolean,
  weekend boolean,
  sunday_appropriate boolean,          -- not used until Scott defines it (brief §5)
  categories text[],
  summary text,
  embedding vector,                    -- optional; populated only if embeddings are enabled
  content_hash text,                   -- hash the tags were computed from (tagging cache)
  tagged_at timestamptz,
  model text
);

create table if not exists search_log (
  id bigserial primary key,
  session_id text,
  query text,
  parsed jsonb,
  result_ids text[],
  clicked_id text,
  channel text,                        -- finder | chat
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (   -- delete after 90 days
  id bigserial primary key,
  session_id text not null,
  role text not null,
  text text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on chat_messages (session_id, created_at);

create table if not exists health_flags (
  id bigserial primary key,
  project_id text references projects(id) on delete cascade,
  kind text,
  detail text,
  city text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
