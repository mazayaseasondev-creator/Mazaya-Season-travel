-- Outbound notification log (email/SMS). Like OTP, messages are recorded in
-- dev and "sent" once a real provider is wired. Idempotent.

create table if not exists notifications (
  id         serial primary key,
  user_id    integer references users(id),
  channel    text not null default 'email',   -- email | sms | system
  recipient  text,
  subject    text not null,
  body       text,
  status     text not null default 'sent',     -- sent | queued | failed
  created_at timestamptz not null default now()
);
