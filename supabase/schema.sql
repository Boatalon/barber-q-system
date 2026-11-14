-- Supabase / PostgreSQL Schema สำหรับระบบจองคิวร้านตัดผม
-- รองรับการใช้งานบนคลาวด์ควบคู่กับฐานข้อมูล SQLite ในเครื่อง

create type queue_source as enum ('LINE', 'WALK_IN');
create type queue_status as enum ('WAITING', 'SERVING', 'COMPLETED', 'CANCELLED');

create table if not exists public.queues (
  id bigint generated always as identity primary key,
  queue_date date not null default current_date,
  queue_number integer not null,
  display_code text not null,
  source queue_source not null,
  line_user_id text,
  status queue_status not null default 'WAITING',
  notified_near_1 boolean not null default false,
  notified_near_2 boolean not null default false,
  call_count integer not null default 0,
  last_called_at timestamptz,
  created_at timestamptz not null default now(),
  served_at timestamptz,
  closed_at timestamptz,
  constraint queues_date_number_unique unique (queue_date, queue_number)
);

-- Partial index สำหรับค้นหาคิวที่กำลังทำงานอยู่ได้อย่างรวดเร็ว
create index if not exists idx_queues_active_date_number
  on public.queues (queue_date, queue_number)
  where status in ('WAITING', 'SERVING');

-- Partial index สำหรับค้นหาคิวที่กำลังใช้งานของลูกค้า LINE
create index if not exists idx_queues_active_line_user
  on public.queues (line_user_id, queue_date)
  where status in ('WAITING', 'SERVING') and line_user_id is not null;

create table if not exists public.shop_settings (
  id integer primary key default 1 check (id = 1),
  shop_name text not null default 'ร้านตัดผม (Barber Queue)',
  notify_ahead_first integer not null default 3,
  notify_ahead_second integer not null default 1,
  repeat_call_interval_sec integer not null default 120,
  repeat_call_max_count integer not null default 3,
  walkin_popup_duration_sec integer not null default 6,
  last_walkin_display_code text,
  last_walkin_created_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.shop_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.notification_logs (
  id bigint generated always as identity primary key,
  queue_id bigint references public.queues(id) on delete cascade,
  display_code text not null,
  line_user_id text not null,
  trigger_type text not null, -- 'BOOKED', 'NEAR_1', 'NEAR_2', 'CALLED', 'RECALL', 'CANCELLED'
  message text not null,
  delivered_via text not null default 'SIMULATOR', -- 'LINE_API' or 'SIMULATOR'
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_logs_queue_id
  on public.notification_logs (queue_id);
create index if not exists idx_notification_logs_line_user_created
  on public.notification_logs (line_user_id, created_at desc);

