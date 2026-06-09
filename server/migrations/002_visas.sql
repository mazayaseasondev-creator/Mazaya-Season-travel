-- Phase 2 schema: visa products, visa requests, uploaded documents, payments.
-- See docs/BACKEND-PLAN.md (Phase 2 — Visas first).

-- A catalogue of visa products the customer can apply for. Prices are stored in
-- minor units (fils/cents) to avoid floating-point money bugs.
create table if not exists visa_types (
  id              bigserial primary key,
  code            text        not null unique,
  name            text        not null,
  country         text        not null,
  price_cents     integer     not null,
  currency        text        not null default 'AED',
  processing_days integer     not null default 5,
  active          boolean     not null default true,
  created_at      timestamptz not null default now()
);

-- A customer's application for a specific visa type.
-- Status flow: awaiting_payment -> in_review -> approved | rejected
--              (cancelled is also possible from awaiting_payment)
create table if not exists visa_requests (
  id              bigserial primary key,
  user_id         bigint      not null references users(id) on delete cascade,
  visa_type_id    bigint      not null references visa_types(id),
  applicant_name  text        not null,
  nationality     text        not null,
  passport_number text        not null,
  travel_date     date,
  status          text        not null default 'awaiting_payment',
  admin_note      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_visa_requests_user on visa_requests(user_id);
create index if not exists idx_visa_requests_status on visa_requests(status);

-- Supporting documents (passport scan, photo, etc.) uploaded for a request.
-- The bytes live on disk (or object storage); we only keep metadata here.
create table if not exists visa_documents (
  id              bigserial primary key,
  visa_request_id bigint      not null references visa_requests(id) on delete cascade,
  kind            text        not null default 'document',
  original_name   text        not null,
  stored_name     text        not null,
  mime            text,
  size_bytes      integer     not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_visa_documents_request on visa_documents(visa_request_id);

-- A payment attempt against a visa request. `provider_ref` is the id we hand to
-- (and receive back from) the payment gateway; in simulated mode we generate it.
-- Status flow: pending -> paid | failed (refunded is possible after paid).
create table if not exists payments (
  id              bigserial primary key,
  user_id         bigint      not null references users(id) on delete cascade,
  visa_request_id bigint      references visa_requests(id) on delete set null,
  provider        text        not null,
  provider_ref    text        not null unique,
  amount_cents    integer     not null,
  currency        text        not null default 'AED',
  status          text        not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_payments_request on payments(visa_request_id);

-- Seed a small catalogue. Idempotent: re-running migrations won't duplicate rows
-- and won't overwrite prices an operator may have edited.
insert into visa_types (code, name, country, price_cents, currency, processing_days) values
  ('schengen',     'Schengen Tourist Visa',        'Schengen Area',         120000, 'AED', 10),
  ('uk-standard',  'UK Standard Visitor Visa',     'United Kingdom',        140000, 'AED', 15),
  ('usa-b1b2',     'USA B1/B2 Visitor Visa',       'United States',         160000, 'AED', 21),
  ('turkey-evisa', 'Turkey e-Visa',                'Turkey',                 25000, 'AED',  3),
  ('egypt-evisa',  'Egypt e-Visa',                 'Egypt',                  22000, 'AED',  3)
on conflict (code) do nothing;
