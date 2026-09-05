create table public.product_cache (
  id integer generated always as identity primary key,
  platform varchar not null,
  category varchar,
  name varchar not null,
  price numeric(10,2),
  image_url varchar,
  commission_rate numeric(5,2),
  affiliate_url varchar not null,
  created_at timestamp not null default now()
);

create index product_cache_platform_idx on public.product_cache (platform);
create index product_cache_created_at_idx on public.product_cache (created_at);

alter table public.product_cache enable row level security;

create table public.product_refresh_logs (
  id integer generated always as identity primary key,
  status varchar not null,
  products_inserted integer not null default 0,
  products_deleted integer not null default 0,
  message text,
  executed_at timestamp not null default now()
);

alter table public.product_refresh_logs enable row level security;
