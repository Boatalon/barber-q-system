begin;

create or replace function public.list_shop_holiday_dates()
returns table (holiday_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select h.holiday_date
  from public.shop_holidays as h
  order by h.holiday_date;
$$;

revoke all on function public.list_shop_holiday_dates() from public;
grant execute on function public.list_shop_holiday_dates() to anon, authenticated, service_role;

commit;
