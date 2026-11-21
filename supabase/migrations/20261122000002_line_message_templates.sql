alter table public.shop_settings
  add column if not exists line_message_templates jsonb not null default '{}'::jsonb;

alter table public.notification_logs
  add column if not exists queues_ahead integer;
