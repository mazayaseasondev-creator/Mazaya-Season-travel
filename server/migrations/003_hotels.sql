-- Phase 3 schema: hotel bookings (supplier-agnostic).
-- See docs/BACKEND-PLAN.md (Phase 3 — Hotels first).

-- A customer's hotel booking. Inventory and prices come from a supplier
-- (simulated bedbank in dev, Hotelbeds in production); we store the booked
-- snapshot plus the supplier's reference and the issued voucher.
-- Status flow: pending_payment -> confirmed -> cancelled
create table if not exists hotel_bookings (
  id             bigserial primary key,
  user_id        bigint      not null references users(id) on delete cascade,
  supplier       text        not null,
  supplier_ref   text,
  hotel_name     text        not null,
  city           text        not null,
  room_name      text        not null,
  board          text,
  lead_guest     text        not null,
  guests         integer     not null default 2,
  check_in       date        not null,
  check_out      date        not null,
  nights         integer     not null,
  amount_cents   integer     not null,
  currency       text        not null default 'AED',
  status         text        not null default 'pending_payment',
  voucher_code   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_hotel_bookings_user on hotel_bookings(user_id);
create index if not exists idx_hotel_bookings_status on hotel_bookings(status);

-- Payments were introduced in Phase 2 for visas; let a payment also belong to a
-- hotel booking. Each payment references at most one purchasable item.
alter table payments add column if not exists hotel_booking_id bigint references hotel_bookings(id) on delete set null;

create index if not exists idx_payments_hotel on payments(hotel_booking_id);
