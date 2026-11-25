import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { registerHooks } from 'node:module';
import { afterEach, beforeEach, test } from 'node:test';

// Resolve the same TypeScript imports as Next while exercising real route handlers and SDKs.
const src = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) return next(new URL(specifier.slice(2) + '.ts', src).href, context);
    if (specifier.startsWith('./') && context.parentURL?.startsWith(src.href) && !specifier.endsWith('.ts')) {
      return next(specifier + '.ts', context);
    }
    return next(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
});
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://database.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-only';
process.env.LINE_CHANNEL_SECRET = 'test-only';
delete process.env.CRON_SECRET;

const { addWalkInQueue, advanceToNextQueue, bookLineQueue, getSystemQueueState, manualRecallCurrentQueue } = await import('../src/lib/queue-service.ts');
const { POST: toggleIntake } = await import('../src/app/api/queue/toggle-accepting/route.ts');
const { POST: walkIn } = await import('../src/app/api/queue/walk-in/route.ts');
const { POST: webhook } = await import('../src/app/api/line/webhook/route.ts');
const { GET: cron } = await import('../src/app/api/cron/holiday-notify/route.ts');
const { GET: calendar, PUT: editToday } = await import('../src/app/api/settings/holidays/route.ts');
const { announceHolidayChange, announceTodayHoliday } = await import('../src/lib/holiday-notifications.ts');

const date = '2026-11-25';
const originalFetch = globalThis.fetch;
let holiday, settings, queues, recipients, audience, calls, rejectInsert, failLine, failHolidayRead, legacySchema, lineResponder;
const json = (body, status = 200) => Response.json(body, { status });

function fixtureFetch(input, init = {}) {
  const url = new URL(input);
  const path = url.pathname.split('/').at(-1);
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  const query = url.searchParams;
  calls.push({ path, method, body, headers: new Headers(init.headers) });

  if (url.host === 'api.line.me') return lineResponder?.(calls.at(-1)) || json({}, failLine ? 503 : 200);
  assert.equal(url.host, 'database.invalid');
  switch (path) {
    case 'get_today_shop_holiday': {
      if (legacySchema) return json({ code: 'PGRST202', message: 'Missing get_today_shop_holiday' }, 404);
      if (failHolidayRead) return json({ message: 'Calendar unavailable' }, 503);
      const due = holiday && new Date().getTime() >= Date.parse(date + 'T09:00:00+07:00')
        && !holiday.notified_on_day && (!holiday.notification_retry_after || Date.parse(holiday.notification_retry_after) <= Date.now());
      return json(holiday ? [{ holiday_date: date, reason: holiday.reason, announcement_due: due }] : []);
    }
    case 'list_shop_holiday_dates':
      if (query.has('holiday_date')) assert.equal(query.get('holiday_date'), 'eq.' + date);
      return json(holiday ? [{ holiday_date: date }] : []);
    case 'shop_settings':
      if (method === 'PATCH') Object.assign(settings, body);
      return json(settings);
    case 'holiday_notification_audiences':
      if (legacySchema) return json({ code: 'PGRST205' }, 404);
      if (method === 'POST') audience = body;
      return json(audience ? [audience] : []);
    case 'line_followers':
      if (method !== 'GET') return json([]);
      const after = query.getAll('line_user_id').find(filter => filter.startsWith('gt.'))?.slice(3);
      return json(recipients.filter(r => !after || r.line_user_id > after)
        .sort((a, b) => a.line_user_id.localeCompare(b.line_user_id, 'en')).slice(0, 500));
    case 'notification_logs':
      return json([]);
    case 'shop_holidays':
      if (method === 'DELETE') {
        assert.equal(query.get('holiday_date'), 'eq.' + date);
        holiday = null;
        return json([{ id: 42 }]);
      }
      if (method === 'POST') {
        assert.equal(body[0].holiday_date, date);
        holiday = { ...body[0], id: 42, notified_on_day: false };
        return json(null, 201);
      }
      if (method === 'GET') return json(holiday ? [holiday] : []);
      if (method === 'PATCH' && holiday) {
        if (legacySchema && 'notification_claimed_at' in body) return json({ code: 'PGRST204' }, 400);
        if (query.get('notified_on_day') === 'eq.false' && holiday.notified_on_day) return json(null);
        if (query.has('or') && (holiday.notified_on_day || holiday.notification_claimed_at)) {
          return json({ message: 'Expected a single row', details: 'The result contains 0 rows', code: 'PGRST116' }, 406);
        }
        Object.assign(holiday, body);
        return json(holiday);
      }
      break;
    case 'queues':
      if (method === 'HEAD') {
        const issued = queues.filter(q => q.status !== 'CANCELLED' && query.get('queue_date') === 'eq.' + q.queue_date);
        return new Response(null, { headers: { 'content-range': '*/' + issued.length } });
      }
      if (method === 'POST') {
        if (rejectInsert) return json({ code: 'P0001', message: 'SHOP_CLOSED:ปิดฉุกเฉิน' }, 400);
        const row = { ...body, id: queues.length + 1 };
        queues.push(row);
        return json(row, 201);
      }
      if (method === 'PATCH') {
        const row = queues.find(q => query.get('id') === 'eq.' + q.id);
        if (row) Object.assign(row, body);
        return json(row || {});
      }
      if (query.get('status') === 'in.(SERVING,WAITING)') return json(queues.filter(q => ['SERVING', 'WAITING'].includes(q.status)));
      if (query.has('line_user_id') && query.get('select') === '*') {
        return json(queues.filter(q => query.get('line_user_id') === 'eq.' + q.line_user_id
          && (!query.has('status') || query.get('status') === 'eq.' + q.status)).slice(-1));
      }
      if (query.get('select') === 'queue_number') return json(queues.slice(-1));
      return json([]);
  }
  throw new Error('Unexpected fixture request ' + method + ' ' + url.pathname);
}

// The Supabase client captures this dispatcher on construction.
const dispatch = async (...args) => fixtureFetch(...args);
beforeEach(t => {
  globalThis.fetch = dispatch;
  t.mock.method(console, 'error', () => {});
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-24T17:30:00Z') }); // 00:30 Bangkok
  holiday = { id: 42, holiday_date: date, reason: 'ร้านหยุดพัก', notified_on_day: false };
  settings = {
    id: 1, shop_name: 'ร้านทดสอบ', booking_open_time: '08:30', booking_close_time: '02:00',
    is_accepting_queue: true, accepting_override_until: null, daily_queue_limit: null,
    barber_line_user_id: null, repeat_call_max_count: 3, line_message_templates: {},
  };
  queues = [];
  recipients = [];
  audience = null;
  calls = [];
  rejectInsert = false;
  failLine = false;
  failHolidayRead = false;
  legacySchema = false;
  lineResponder = null;
});
afterEach(() => { globalThis.fetch = originalFetch; });

async function lineAction(action) {
  const body = JSON.stringify({ events: [{
    type: 'postback', postback: { data: 'action=' + action }, replyToken: 'test',
    source: { type: 'user', userId: 'customer' },
  }] });
  const signature = createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(body).digest('base64');
  const result = await webhook(new Request('https://web.invalid', { method: 'POST', headers: { 'x-line-signature': signature }, body }));
  assert.equal(result.status, 200);
  return calls.findLast(call => call.path === 'reply').body.messages;
}

test('calendar, counter and LINE close at Bangkok midnight even with an active overnight override', async () => {
  settings.accepting_override_until = '2026-11-25T01:30:00Z';
  const state = await getSystemQueueState();
  assert.equal(state.todayDate, '2026-11-24');
  assert.equal(state.isShopClosedToday, true);
  assert.equal(state.isAcceptingQueue, false);
  const cal = await (await calendar({ nextUrl: new URL('https://web.invalid/?view=calendar') })).json();
  assert.equal(cal.shopClosedReason, holiday.reason);
  assert.equal(cal.isShopClosedToday, true);
  assert.equal((await walkIn()).status, 409);
  await assert.rejects(bookLineQueue('customer'), /SHOP_CLOSED:ร้านหยุดพัก/);
  assert.match((await lineAction('book'))[0].text, /ร้านหยุดพัก/);
  assert.equal(calls.some(c => c.path === 'queues' && c.method === 'POST'), false);
});

test('a holiday added during insertion returns the normal closed message in both channels', async () => {
  holiday = null;
  rejectInsert = true;
  assert.equal((await walkIn()).status, 409);
  assert.match((await lineAction('book'))[0].text, /ปิดฉุกเฉิน/);
  assert.equal(queues.length, 0);
});

test('quick reopen and close affect the calendar day while both channels keep overnight queue numbering', async () => {
  const edit = action => editToday({ json: async () => ({ action }) });
  assert.equal((await edit('open')).status, 200);
  const walk = await addWalkInQueue();
  const online = await bookLineQueue('sim_customer');
  assert.equal(walk.queue.display_code, '001');
  assert.equal(online.queue.display_code, '002');
  assert.equal(online.queue.queue_date, '2026-11-24');
  assert.equal((await bookLineQueue('sim_customer')).isNew, false);
  assert.equal((await edit('close')).status, 200);
  assert.equal((await getSystemQueueState()).totalWaiting, 2);
  await assert.rejects(addWalkInQueue(), /SHOP_CLOSED/);
});

test('a failed daily delivery stays pending and a successful retry is recorded once', async () => {
  failLine = true;
  const run = () => cron(new Request('https://web.invalid/cron'));
  assert.equal((await run()).status, 500);
  assert.equal(holiday.notified_on_day, false);
  assert.equal(holiday.notification_claimed_at, null);
  failLine = false;
  const results = await Promise.all([run(), run()].map(async job => (await job).json()));
  assert.equal(results.filter(r => r.broadcastSent).length, 1);
  assert.equal(holiday.notified_on_day, true);
  assert.equal((await (await run()).json()).skipped, true);
  const sends = calls.filter(c => c.path === 'broadcast');
  assert.equal(sends.length, 2);
  assert.ok(sends[0].headers.get('x-line-retry-key'));
  assert.equal(sends[0].headers.get('x-line-retry-key'), sends[1].headers.get('x-line-retry-key'));
});

test('a targeted notice needs real customers, excludes the barber, and reports delivery failure', async t => {
  t.mock.timers.setTime(Date.parse(date + 'T03:00:00Z')); // after 09:00 Bangkok
  settings.barber_line_user_id = 'barber';
  recipients = [{ line_user_id: 'barber' }, { line_user_id: 'sim_123' }];
  const failed = await announceHolidayChange([date]);
  assert.ok(failed.broadcastError);
  assert.equal(holiday.notified_on_day, false);
  recipients.push({ line_user_id: 'customer' }, { line_user_id: 'customer' });
  assert.equal((await announceHolidayChange([date], 'ประกาศฉบับแก้ไข')).broadcastSent, true);
  assert.deepEqual(calls.find(c => c.path === 'multicast').body, {
    to: ['customer'], messages: [{ type: 'text', text: 'ประกาศฉบับแก้ไข' }],
  });
  assert.equal(holiday.notified_on_day, true);
});

test('advance announcements remain optional and separate from the day-of reminder', async () => {
  assert.equal((await announceHolidayChange([date])).broadcastSent, false);
  assert.equal((await announceHolidayChange(['2026-11-26'], 'หยุดพรุ่งนี้')).broadcastSent, true);
  assert.equal(holiday.notified_on_day, false);
  assert.deepEqual(calls.filter(c => c.path === 'broadcast')[0].body.messages, [{ type: 'text', text: 'หยุดพรุ่งนี้' }]);
});

test('an unreadable holiday calendar never issues a queue', async () => {
  failHolidayRead = true;
  await assert.rejects(bookLineQueue('customer'));
  await assert.rejects(addWalkInQueue());
  assert.equal(queues.length, 0);
});

test('a partial multicast retry keeps the original batches when new followers arrive', async () => {
  settings.barber_line_user_id = 'barber';
  recipients = Array.from({ length: 502 }, (_, i) => ({ line_user_id: 'U' + String(i).padStart(4, '0') }));
  const accepted = new Set();
  let attempt = 0;
  lineResponder = call => {
    const key = call.headers.get('x-line-retry-key');
    if (accepted.has(key)) {
      return Response.json({}, { status: 409, headers: { 'x-line-accepted-request-id': 'accepted' } });
    }
    if (++attempt === 2) return json({}, 503);
    accepted.add(key);
    return json({});
  };
  const run = () => cron(new Request('https://web.invalid/cron'));
  assert.equal((await run()).status, 500);
  recipients.push({ line_user_id: 'A-new-follower' });
  assert.equal((await (await run()).json()).broadcastSent, true);
  assert.equal(accepted.size, 2);
  const batches = calls.filter(c => c.path === 'multicast').map(c => c.body.to);
  assert.deepEqual(batches.map(b => b.length), [500, 2, 500, 2]);
  assert.deepEqual(batches.slice(0, 2), batches.slice(2));
});

test('queue state signals a missed morning notice and waits ten minutes after a failed recovery', async t => {
  const recover = () => announceTodayHoliday({ onlyIfDue: true });
  assert.equal((await getSystemQueueState()).holidayAnnouncementDue, false);
  assert.equal((await recover()).skipped, true);
  t.mock.timers.setTime(Date.parse(date + 'T09:05:00+07:00'));
  assert.equal((await getSystemQueueState()).holidayAnnouncementDue, true);
  failLine = true;
  await assert.rejects(recover());
  assert.equal((await getSystemQueueState()).holidayAnnouncementDue, false);
  assert.equal((await recover()).skipped, true);
  t.mock.timers.setTime(Date.parse(date + 'T09:15:00+07:00'));
  failLine = false;
  assert.equal((await recover()).broadcastSent, true);
  assert.equal((await getSystemQueueState()).holidayAnnouncementDue, false);
});

test('the previous schema keeps the counter, LINE booking and holiday calendar available during rollout', async () => {
  legacySchema = true;
  const closed = holiday;
  holiday = null;
  assert.equal((await getSystemQueueState()).isAcceptingQueue, true);
  assert.equal((await addWalkInQueue()).queue.display_code, '001');
  assert.equal((await lineAction('book'))[0].type, 'flex');
  holiday = closed;
  assert.equal((await getSystemQueueState()).isShopClosedToday, true);
  assert.match((await lineAction('book'))[0].text, /ร้านหยุดพัก/);
  assert.equal((await (await cron(new Request('https://web.invalid/cron'))).json()).broadcastSent, true);
  assert.equal(holiday.notified_on_day, true);
});

test('manual and daily announcements keep the existing customer audience without a configured barber', async () => {
  recipients = [{ line_user_id: 'known-customer' }];
  assert.equal((await announceHolidayChange(['2026-11-26'], 'ประกาศล่วงหน้า')).broadcastSent, true);
  assert.equal((await announceTodayHoliday()).broadcastSent, true);
  assert.deepEqual(calls.filter(c => c.path === 'multicast').map(c => c.body.to), [['known-customer'], ['known-customer']]);
  assert.equal(calls.some(c => c.path === 'broadcast'), false);
});

test('closing intake preserves LINE status, cancellation, calls and recalls for existing queues', async () => {
  const closed = holiday;
  holiday = null;
  await bookLineQueue('customer');
  await bookLineQueue('other-customer');
  holiday = closed;
  assert.deepEqual((await lineAction('status')).map(m => m.type), ['text', 'flex']);
  assert.equal((await lineAction('cancel'))[0].type, 'flex');
  assert.equal(queues[0].status, 'CANCELLED');

  const next = await advanceToNextQueue();
  await next.notifyPromise;
  assert.equal(next.nowServing.line_user_id, 'other-customer');
  const recall = await manualRecallCurrentQueue();
  await recall.notifyPromise;
  assert.equal(recall.success, true);
  assert.equal(queues[1].call_count, 2);
  assert.deepEqual(calls.filter(c => c.path === 'notification_logs' && c.method === 'POST')
    .map(c => c.body.trigger_type), ['BOOKED', 'BOOKED', 'CANCELLED', 'CALLED', 'RECALL']);
  const completed = await advanceToNextQueue();
  await completed.notifyPromise;
  assert.equal(queues[1].status, 'COMPLETED');
});

test('opening hours, manual pause and the shared daily limit still apply on ordinary days', async t => {
  holiday = null;
  settings.booking_close_time = '20:00';
  t.mock.timers.setTime(Date.parse(date + 'T08:00:00+07:00'));
  await assert.rejects(bookLineQueue('customer'), /BOOKING_NOT_OPEN_YET/);
  assert.equal((await walkIn()).status, 409);
  t.mock.timers.setTime(Date.parse(date + 'T08:30:00+07:00'));

  const toggle = isAcceptingQueue => toggleIntake({ json: async () => ({ isAcceptingQueue }) });
  assert.equal((await (await toggle(false)).json()).isAcceptingQueue, false);
  await assert.rejects(addWalkInQueue(), /QUEUE_NOT_ACCEPTING/);
  await assert.rejects(bookLineQueue('customer'), /QUEUE_NOT_ACCEPTING/);
  assert.equal((await (await toggle(true)).json()).isAcceptingQueue, true);
  settings.daily_queue_limit = 1;
  assert.equal((await walkIn()).status, 200);
  await assert.rejects(bookLineQueue('customer'), /DAILY_LIMIT_REACHED/);
  assert.equal((await walkIn()).status, 409);
  assert.equal(queues.length, 1);
});
