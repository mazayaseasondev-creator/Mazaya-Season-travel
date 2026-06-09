-- Phase 4 schema: sales/support leads captured from the public contact form.
-- See docs/BACKEND-PLAN.md (Phase 4 — Admin + go-live).

create table if not exists leads (
  id          bigserial primary key,
  name        text        not null,
  email       text,
  mobile      text,
  message     text        not null,
  source      text        not null default 'contact-form',
  status      text        not null default 'new',
  created_at  timestamptz not null default now()
);

create index if not exists idx_leads_status on leads(status);
