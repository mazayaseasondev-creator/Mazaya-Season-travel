-- Phase 1 schema: users + one-time passcodes.

create table if not exists users (
  id          bigserial primary key,
  email       text unique,
  mobile      text unique,
  name        text,
  role        text        not null default 'customer',
  miles       integer     not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists otp_codes (
  id          bigserial primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  code_hash   text        not null,
  expires_at  timestamptz not null,
  attempts    integer     not null default 0,
  consumed    boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_otp_codes_user on otp_codes(user_id);
