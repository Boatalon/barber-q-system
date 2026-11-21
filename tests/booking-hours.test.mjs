import assert from 'node:assert/strict';
import test from 'node:test';
import { getBangkokTimeString, getBookingTimeStatus, getNextOpeningIso, getQueueBusinessDate, isBookingOpen } from '../src/lib/booking-hours.ts';

test('both booking channels share the exact Bangkok opening and closing boundaries', () => {
  const cases = [
    ['2026-11-21T01:29:00Z', '08:29', 'BEFORE_OPEN'],
    ['2026-11-21T01:30:00Z', '08:30', 'OPEN'],
    ['2026-11-21T12:59:59Z', '19:59', 'OPEN'],
    ['2026-11-21T13:00:00Z', '20:00', 'AFTER_CLOSE'],
    ['2026-11-21T17:00:00Z', '00:00', 'BEFORE_OPEN'],
  ];
  for (const [utc, time, expected] of cases) {
    const now = new Date(utc);
    assert.equal(getBangkokTimeString(now), time);
    assert.equal(getBookingTimeStatus('08:30', '20:00', now), expected);
  }
});

test('08:30 to 02:00 stays open across midnight and closes exactly at 02:00', () => {
  const cases = [
    ['2026-11-21T01:29:00Z', 'AFTER_CLOSE', '2026-11-20'],
    ['2026-11-21T01:30:00Z', 'OPEN', '2026-11-21'],
    ['2026-11-21T16:59:00Z', 'OPEN', '2026-11-21'],
    ['2026-11-21T17:00:00Z', 'OPEN', '2026-11-21'],
    ['2026-11-21T18:59:59Z', 'OPEN', '2026-11-21'],
    ['2026-11-21T19:00:00Z', 'AFTER_CLOSE', '2026-11-21'],
  ];
  for (const [utc, status, businessDate] of cases) {
    const now = new Date(utc);
    assert.equal(getBookingTimeStatus('08:30', '02:00', now), status);
    assert.equal(getQueueBusinessDate('08:30', '02:00', now), businessDate);
  }
});

test('resuming after close expires at the next opening; manual pause always wins', () => {
  const now = new Date('2026-11-21T20:00:00Z'); // 03:00 Bangkok
  const accepting_override_until = getNextOpeningIso('08:30', now);
  assert.equal(accepting_override_until, '2026-11-22T01:30:00.000Z');
  const settings = {
    booking_open_time: '08:30', booking_close_time: '02:00',
    is_accepting_queue: true, accepting_override_until,
  };
  assert.equal(isBookingOpen(settings, now), true);
  assert.equal(isBookingOpen(settings, new Date(accepting_override_until)), true); // normal hours now open
  assert.equal(isBookingOpen({ ...settings, is_accepting_queue: false }, now), false);
  assert.equal(isBookingOpen({ ...settings, accepting_override_until: null }, now), false);
});

test('daytime close override cannot carry into tomorrow night', () => {
  const now = new Date('2026-11-21T14:00:00Z'); // 21:00 Bangkok
  const until = getNextOpeningIso('08:30', now);
  assert.equal(until, '2026-11-22T01:30:00.000Z');
  assert.equal(getQueueBusinessDate('08:30', '20:00', new Date('2026-11-21T17:30:00Z'), until), '2026-11-21');
  assert.equal(getQueueBusinessDate('08:30', '20:00', new Date(until), until), '2026-11-22');
  assert.equal(isBookingOpen({
    booking_open_time: '08:30', booking_close_time: '20:00',
    is_accepting_queue: true, accepting_override_until: until,
  }, new Date('2026-11-22T14:00:00Z')), false);
});
