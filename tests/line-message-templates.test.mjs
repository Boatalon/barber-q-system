import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LINE_TEMPLATE_DEFINITIONS,
  LINE_TEMPLATE_GROUPS,
  renderLineMessage,
  validateLineTemplates,
} from '../src/lib/line-message-templates.ts';

test('every LINE template appears exactly once in the notification editor', () => {
  const keys = LINE_TEMPLATE_GROUPS.flatMap((group) => group.keys);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual([...keys].sort(), Object.keys(LINE_TEMPLATE_DEFINITIONS).sort());
  for (const [key, definition] of Object.entries(LINE_TEMPLATE_DEFINITIONS)) {
    assert.ok(validateLineTemplates({ [key]: definition.value })[key]);
  }
});

test('custom texts interpolate approved variables and preserve the fallback', () => {
  const overrides = validateLineTemplates({ near_first: 'คิว {queue_code} รออีก {queues_ahead} คิว' });
  assert.equal(renderLineMessage(overrides, 'near_first', { queue_code: '009', queues_ahead: 2 }), 'คิว 009 รออีก 2 คิว');
  assert.equal(renderLineMessage(overrides, 'booking_paused'), LINE_TEMPLATE_DEFINITIONS.booking_paused.value);
  assert.throws(() => validateLineTemplates({ near_first: 'Hello {unknown}' }), /ตัวแปร/);
  assert.throws(() => validateLineTemplates({ booking_paused: '' }), /ต้องมี/);
  assert.throws(() => validateLineTemplates({ made_up: 'text' }), /หัวข้อ/);
});
