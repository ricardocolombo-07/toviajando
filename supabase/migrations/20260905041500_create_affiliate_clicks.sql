create table public.affiliate_clicks (
  id integer generated always as identity primary key,
  partner varchar not null,
  product_url varchar not null,
  destination varchar,
  user_id varchar,
  clicked_at timestamp not null default now()
);

alter table public.affiliate_clicks enable row level security;
