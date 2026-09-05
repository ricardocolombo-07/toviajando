-- Replace ANON_KEY_PLACEHOLDER with the project's actual anon/publishable
-- key before applying this migration to another environment (it's baked
-- into the stored cron job as a literal, not read from a secret store).
select cron.schedule(
  'daily-product-refresh',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://hegtounbzvizlhjdvvnw.supabase.co/functions/v1/product-refresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ANON_KEY_PLACEHOLDER',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
