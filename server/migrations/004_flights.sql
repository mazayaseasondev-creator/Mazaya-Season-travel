-- Phase 3 (cont.) schema: flight bookings (supplier-agnostic).
-- See docs/BACKEND-PLAN.md (Phase 3 — Flights).

-- A customer's flight booking. Inventory and prices come from a supplier
-- (simulated GDS in dev, Amadeus in production). A booking is "held" against a
-- PNR with a ticketing deadline; once paid, tickets are issued.
-- Status flow: pending_payment -> ticketed -> cancelled
create table if not exists flight_bookings (
  id                 bigserial primary key,
  user_id            bigint      not null references users(id) on delete cascade,
  supplier           text        not null,
  pnr                text,
  airline            text        not null,
  flight_number      text        not null,
  origin             text        not null,
  destination        text        not null,
  depart_at          timestamptz not null,
  arrive_at          timestamptz not null,
  cabin              text        not null default 'Economy',
  passengers         integer     not null default 1,
  lead_passenger     text        not null,
  amount_cents       integer     not null,
  currency           text        not null default 'AED',
  status             text        not null default 'pending_payment',
  ticketing_deadline timestamptz,
  ticket_numbers     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_flight_bookings_user on flight_bookings(user_id);
create index if not exists idx_flight_bookings_status on flight_bookings(status);

-- Let a payment also belong to a flight booking (alongside visas and hotels).
alter table payments add column if not exists flight_booking_id bigint references flight_bookings(id) on delete set null;

create index if not exists idx_payments_flight on payments(flight_booking_id);
