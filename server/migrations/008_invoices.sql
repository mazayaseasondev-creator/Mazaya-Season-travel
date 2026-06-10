-- Manually-raised invoices (in addition to the sales invoices derived from
-- captured payments). Idempotent: safe to run on every boot.

create table if not exists invoices (
  id           serial primary key,
  user_id      integer references users(id),
  contact      text not null,
  description  text not null,
  amount_cents integer not null,
  currency     text not null default 'AED',
  status       text not null default 'issued',  -- issued | paid | void
  created_at   timestamptz not null default now()
);
