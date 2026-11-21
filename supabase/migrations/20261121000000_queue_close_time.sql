alter table public.shop_settings
  add column if not exists booking_close_time text not null default '20:00';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shop_settings_booking_close_time_format') then
    alter table public.shop_settings add constraint shop_settings_booking_close_time_format
      check (booking_close_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shop_settings_booking_hours_order') then
    alter table public.shop_settings add constraint shop_settings_booking_hours_order
      check (booking_open_time < booking_close_time);
  end if;
end $$;

create or replace function public.check_queue_booking_controls()
returns trigger language plpgsql as $$
declare
  limits public.shop_settings%rowtype;
  issued_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.queue_date::text));
  select * into limits from public.shop_settings where id = 1;
  if not limits.is_accepting_queue then
    raise exception 'QUEUE_NOT_ACCEPTING';
  end if;
  if (now() at time zone 'Asia/Bangkok')::time < limits.booking_open_time::time then
    raise exception 'BOOKING_NOT_OPEN_YET:%', limits.booking_open_time;
  end if;
  if (now() at time zone 'Asia/Bangkok')::time >= limits.booking_close_time::time then
    raise exception 'BOOKING_CLOSED_FOR_TODAY:%', limits.booking_close_time;
  end if;
  if limits.daily_queue_limit is not null then
    select count(*) into issued_count from public.queues
      where queue_date = new.queue_date and status in ('WAITING', 'SERVING', 'COMPLETED');
    if issued_count >= limits.daily_queue_limit then
      raise exception 'DAILY_LIMIT_REACHED:%', limits.daily_queue_limit;
    end if;
  end if;
  select coalesce(max(queue_number), 0) + 1 into new.queue_number
    from public.queues where queue_date = new.queue_date;
  new.display_code := case when new.queue_number < 1000
    then lpad(new.queue_number::text, 3, '0') else new.queue_number::text end;
  return new;
end;
$$;
