create table if not exists lottery_settings (
  id text primary key default 'default',
  school_name text not null default '19ο Δημοτικό Σχολείο Θεσσαλονίκης',
  event_title text not null default 'Σχολική γιορτή λήξης σχολικού έτους',
  booklet_input text not null default '',
  ticket_input text not null default '',
  prize_input text not null default '',
  batch_size integer not null default 10 check (batch_size between 1 and 50),
  interval_seconds integer not null default 5 check (interval_seconds between 1 and 30),
  updated_at timestamptz not null default now()
);

create table if not exists lottery_results (
  id text primary key,
  order_number integer not null,
  batch integer not null,
  prize text not null,
  ticket text not null,
  drawn_at timestamptz not null,
  image_url text,
  visual_key text,
  created_at timestamptz not null default now()
);

create index if not exists lottery_results_order_number_idx
on lottery_results (order_number);

insert into lottery_settings (id)
values ('default')
on conflict (id) do nothing;
