-- Pricing markup rules (per product) and discount vouchers.
-- Idempotent: safe to run on every boot.

create table if not exists pricing_rules (
  product        text primary key,
  markup_percent numeric(6,2) not null default 0,
  updated_at     timestamptz  not null default now()
);

insert into pricing_rules (product, markup_percent) values
  ('hotel', 0), ('flight', 0), ('tour', 0)
on conflict (product) do nothing;

create table if not exists vouchers (
  id          serial primary key,
  code        text unique not null,
  kind        text not null default 'percent',   -- 'percent' | 'fixed'
  value       numeric(10,2) not null default 0,  -- percent (0-100) or fixed amount
  active      boolean not null default true,
  expires_on  date,
  max_uses    integer,
  used_count  integer not null default 0,
  created_at  timestamptz not null default now()
);
