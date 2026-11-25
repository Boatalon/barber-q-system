-- Run against a disposable Supabase database after applying the schema or migrations.
begin;

update public.shop_settings set is_accepting_queue = true, daily_queue_limit = null,
  accepting_override_until = now() + interval '1 day' where id = 1;

do $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Bangkok')::date;
  channel public.queue_source;
begin
  insert into public.shop_holidays (holiday_date, reason) values (today, 'holiday-test')
    on conflict (holiday_date) do update set reason = excluded.reason;
  if not exists (select 1 from public.get_today_shop_holiday() where reason = 'holiday-test') then
    raise exception 'Missing calendar closure';
  end if;
  foreach channel in array array['LINE', 'WALK_IN']::public.queue_source[] loop
    begin
      -- An overnight ticket can carry yesterday's queue date on today's holiday.
      insert into public.queues (queue_date, source) values (today - 1, channel);
      raise exception 'Unexpected booking on holiday';
    exception when raise_exception then
      if sqlerrm <> 'SHOP_CLOSED:holiday-test' then raise; end if;
    end;
  end loop;

  delete from public.shop_holidays where holiday_date = today;
  insert into public.shop_holidays (holiday_date) values (today + 1) on conflict do nothing;
  if exists (select 1 from public.get_today_shop_holiday()) then
    raise exception 'Future holiday closed the shop early';
  end if;
  insert into public.queues (queue_date, source) values (today - 1, 'WALK_IN'), (today - 1, 'LINE');
end;
$$;

rollback;
