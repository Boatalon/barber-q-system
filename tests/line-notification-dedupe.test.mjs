import assert from 'node:assert/strict';
import test from 'node:test';
import { wasNearNoticeSent } from '../src/lib/line-notification-dedupe.ts';

test('edited notification text cannot cause a duplicate at the same queue position', () => {
  const logs = [{ queue_id: 42, queues_ahead: 2, message: 'ข้อความใหม่ที่ไม่มีคำว่าเหลืออีก' }];
  assert.equal(wasNearNoticeSent(logs, 42, 2), true);
  assert.equal(wasNearNoticeSent(logs, 42, 1), false);
  assert.equal(wasNearNoticeSent(logs, 43, 2), false);
});

test('notifications created before the migration still block duplicates', () => {
  const logs = [{ queue_id: 42, queues_ahead: null, message: 'เหลืออีกเพียง 1 คิวก่อนถึงลำดับ' }];
  assert.equal(wasNearNoticeSent(logs, 42, 1), true);
});
