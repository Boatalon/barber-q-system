import { getBangkokTimeString } from './booking-hours';
import { getSupabase, getTodayDateString } from './db';
import { broadcastLineMessage } from './line';
import { renderLineMessage } from './line-message-templates';
import { formatShopDisplayName, getSettings, getTodayShopHoliday } from './queue-service';

class AnnouncementDeliveryError extends Error {}

export async function announceTodayHoliday(options: {
  message?: string;
  expectedDate?: string;
  onlyIfDue?: boolean;
} = {}) {
  const holiday = await getTodayShopHoliday();
  if (!holiday || (options.expectedDate && holiday.holiday_date !== options.expectedDate) || (options.onlyIfDue && !holiday.announcement_due)) {
    return { skipped: true, broadcastSent: false };
  }

  const supabase = getSupabase();
  const now = new Date();
  // An interrupted worker can be retried. Only the owner of the lease may finish it.
  const claimedAt = now.toISOString();
  const leaseMs = 10 * 60_000;
  const staleBefore = new Date(now.getTime() - leaseMs).toISOString();
  const retryAfter = new Date(now.getTime() + leaseMs).toISOString();
  // Older schemas used the delivery flag itself as the cron claim.
  const legacy = holiday.announcement_due === undefined;
  let claim = supabase.from('shop_holidays')
    .update(legacy ? { notified_on_day: true } : { notification_claimed_at: claimedAt, notification_retry_after: retryAfter })
    .eq('holiday_date', holiday.holiday_date)
    .eq('notified_on_day', false);
  if (!legacy) {
    claim = claim.or(`notification_claimed_at.is.null,notification_claimed_at.lt.${staleBefore}`);
  }
  if (options.onlyIfDue) {
    claim = claim.or(`notification_retry_after.is.null,notification_retry_after.lte.${claimedAt}`);
  }
  const { data: claimed, error } = await claim.select('id,reason').maybeSingle();
  if (error) throw error;
  if (!claimed) {
    // RLS can hide the row from UPDATE even though the public calendar sees the closure.
    const { data: row, error: readError } = await supabase.from('shop_holidays')
      .select('*').eq('holiday_date', holiday.holiday_date).maybeSingle();
    if (readError) throw readError;
    const activeClaim = row?.notification_claimed_at && Date.parse(row.notification_claimed_at) >= Date.parse(staleBefore);
    const waitingToRetry = options.onlyIfDue && row?.notification_retry_after && Date.parse(row.notification_retry_after) > now.getTime();
    if (!row?.notified_on_day && !activeClaim && !waitingToRetry && await getTodayShopHoliday()) {
      throw new Error('ไม่สามารถอัปเดตสถานะแจ้งเตือนวันหยุดในฐานข้อมูลได้');
    }
    return { skipped: true, broadcastSent: false };
  }

  const finish = (sent: boolean) => {
    const update = legacy ? { notified_on_day: sent } : {
      notified_on_day: sent, notification_claimed_at: null, notification_retry_after: sent ? null : retryAfter,
    };
    let query = supabase.from('shop_holidays').update(update).eq('id', claimed.id);
    if (!legacy) query = query.eq('notification_claimed_at', claimedAt);
    return query.select('id').single();
  };
  try {
    const settings = await getSettings();
    const reason = claimed.reason || 'วันหยุดประจำร้าน';
    const notice = options.message || renderLineMessage(settings.line_message_templates, 'holiday_announcement', {
      shop_name: formatShopDisplayName(settings.shop_name), dates: holiday.holiday_date, reason,
    });
    const result = await broadcastLineMessage(notice, legacy ? undefined : claimed.id);
    if (!result.success) throw new AnnouncementDeliveryError(result.error);
    const { error: finishError } = await finish(true);
    if (finishError) throw finishError;
    return { success: true, broadcastSent: true, holidayDate: holiday.holiday_date, reason };
  } catch (err) {
    const { error: releaseError } = await finish(false);
    if (releaseError) console.error('[holiday notice release]', releaseError.message);
    throw err;
  }
}

/** A same-day closure saved after the morning run still gets its daily announcement. */
export async function announceHolidayChange(dates: string[], message?: string) {
  try {
    const today = getTodayDateString();
    if (dates.includes(today) && getBangkokTimeString() >= '09:00') {
      const daily = await announceTodayHoliday({ message, expectedDate: today });
      if (daily.broadcastSent) return { broadcastSent: true };
    }
    if (!message) return { broadcastSent: false };
    const result = await broadcastLineMessage(message);
    return { broadcastSent: result.success, broadcastError: result.error };
  } catch (err) {
    console.error('[holiday announcement]', err);
    return { broadcastSent: false, broadcastError: err instanceof AnnouncementDeliveryError ? err.message : 'ส่งประกาศ LINE ไม่สำเร็จ' };
  }
}
