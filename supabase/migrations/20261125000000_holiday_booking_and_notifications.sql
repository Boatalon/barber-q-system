begin;

alter table public.shop_holidays
  add column if not exists notification_claimed_at timestamptz,
  add column if not exists notification_retry_after timestamptz;

-- Public status is limited to the current Bangkok calendar day, even under RLS.
create or replace function public.get_today_shop_holiday()
returns table (holiday_date date, reason text, announcement_due boolean)
language sql stable security definer set search_path = ''
as $$
  select h.holiday_date, h.reason,
    not h.notified_on_day
      and (statement_timestamp() at time zone 'Asia/Bangkok')::time >= time '09:00'
      and (h.notification_retry_after is null or h.notification_retry_after <= statement_timestamp())
      as announcement_due
  from public.shop_holidays h
  where h.holiday_date = (statement_timestamp() at time zone 'Asia/Bangkok')::date;
$$;

revoke all on function public.get_today_shop_holiday() from public;
grant execute on function public.get_today_shop_holiday() to anon, authenticated, service_role;

create or replace function public.reject_holiday_booking()
returns trigger language plpgsql set search_path = '' as $$
declare
  holiday_reason text;
begin
  select reason into holiday_reason from public.get_today_shop_holiday();
  if found then
    raise exception 'SHOP_CLOSED:%', coalesce(nullif(holiday_reason, ''), 'วันหยุดประจำร้าน');
  end if;
  return new;
end;
$$;

-- Runs before queues_booking_controls, including during a manual hours override.
drop trigger if exists queues_block_holiday on public.queues;
create trigger queues_block_holiday before insert on public.queues
  for each row execute function public.reject_holiday_booking();

-- Older installations can have a nullable delivery flag.
update public.shop_holidays set notified_on_day = false where notified_on_day is null;
alter table public.shop_holidays alter column notified_on_day set not null;
-- LINE bookings already supply this optional label on INSERT.
alter table public.queues add column if not exists customer_label text;

-- Keep multicast batches stable if LINE accepts some batches before a worker retries.
create table if not exists public.holiday_notification_audiences (
  holiday_id bigint primary key references public.shop_holidays(id) on delete cascade,
  recipient_ids text[] -- null means all OA followers
);
alter table public.holiday_notification_audiences enable row level security;
revoke all on public.holiday_notification_audiences from public, anon, authenticated;
grant select, insert on public.holiday_notification_audiences to service_role;

-- The webhook records followers even when they have never booked a queue.
-- Keep an existing installation's follower policies and access mode.
do $$
begin
  if to_regclass('public.line_followers') is null then
    create table public.line_followers (line_user_id text primary key);
    alter table public.line_followers enable row level security;
  end if;
end;
$$;
grant select, insert, update on public.line_followers to service_role;

commit;
