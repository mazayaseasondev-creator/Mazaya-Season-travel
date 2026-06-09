-- Phase 3 (cont.) schema: tour bookings (supplier-agnostic).
-- See docs/BACKEND-PLAN.md (Phase 3 — Tours last).

-- A customer's tour/activity booking, including the chosen transfer and guide
-- options. Inventory and prices come from a supplier (simulated in dev, Viator
-- in production).
-- Status flow: pending_payment -> confirmed -> cancelled
create table if not exists tour_bookings (
  id              bigserial primary key,
  user_id         bigint      not null references users(id) on delete cascade,
  supplier        text        not null,
  supplier_ref    text,
  tour_name       text        not null,
  city            text        not null,
  tour_date       date        not null,
  transfer_option text        not null default 'none',
  guide_option    text        not null default 'audio',
  travellers      integer     not null default 1,
  lead_traveller  text        not null,
  amount_cents    integer     not null,
  currency        text        not null default 'AED',
  status          text        not null default 'pending_payment',
  voucher_code    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tour_bookings_user on tour_bookings(user_id);
create index if not exists idx_tour_bookings_status on tour_bookings(status);

-- Let a payment also belong to a tour booking (alongside visas/hotels/flights).
alter table payments add column if not exists tour_booking_id bigint references tour_bookings(id) on delete set null;

create index if not exists idx_payments_tour on payments(tour_booking_id);
