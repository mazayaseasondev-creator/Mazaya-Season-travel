-- Key/value settings for Company info and brand Look & Feel.
-- Idempotent: safe to run on every boot.

create table if not exists settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('company.legalName',   'Mazaya Season Travel LLC'),
  ('company.tradingName', 'Mazaya Season Travel'),
  ('company.licenseNo',   ''),
  ('company.trn',         ''),
  ('company.email',       'info@mazayaseason.travel'),
  ('company.phone',       '600557777'),
  ('company.website',     'https://www.mazayaseason.travel'),
  ('company.address',     'Al Wahda Street'),
  ('company.city',        'Abu Dhabi'),
  ('company.country',     'United Arab Emirates'),
  ('company.currency',    'AED'),
  ('brand.primaryColor',  '#1B4087'),
  ('brand.accentColor',   '#FFC831'),
  ('brand.logoUrl',       ''),
  ('brand.tagline',       'Flights, hotels, tours & visas from Abu Dhabi to the world')
on conflict (key) do nothing;
