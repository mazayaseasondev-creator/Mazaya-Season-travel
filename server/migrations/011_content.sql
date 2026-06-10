-- Generic content store backing the CMS-style admin modules (FAQ, static pages,
-- B2B static blocks, packages, hotel content, ancillaries, GEO reference data,
-- agencies, translations, and read-only activity/event logs). Idempotent.

create table if not exists content_items (
  id         serial primary key,
  collection text not null,
  data       jsonb not null default '{}',
  position   integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_collection_idx on content_items(collection);
