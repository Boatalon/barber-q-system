import { NextResponse } from 'next/server';
import { getSettings, formatShopDisplayName } from '@/lib/queue-service';
import { getSupabase, getTodayDateString, type ShopHolidayRow } from '@/lib/db';
import { broadcastLineMessage } from '@/lib/line';
import { renderLineMessage } from '@/lib/line-message-templates';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabase();
    const today = getTodayDateString();

    // ดึงวันหยุดของวันนี้ที่ยังไม่ได้แจ้ง (notified_on_day = false)
    const { data: holidayData, error } = await supabase
      .from('shop_holidays')
      .select('*')
      .eq('holiday_date', today)
      .eq('notified_on_day', false)
      .maybeSingle();

    if (error) {
      console.error('[holiday-notify cron] DB error:', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    // ไม่มีวันหยุดวันนี้ หรือส่งแล้ว — ไม่ต้องทำอะไร
    if (!holidayData) {
      return NextResponse.json({
        skipped: true,
        reason: 'ไม่มีวันหยุดวันนี้ หรือส่งแจ้งเตือนไปแล้ว',
      });
    }

    const holiday = holidayData as ShopHolidayRow;
    const settings = await getSettings();
    const shopName = formatShopDisplayName(settings.shop_name);
    const reason = holiday.reason || 'วันหยุดประจำร้าน';

    // สร้างข้อความ broadcast
    const message = renderLineMessage(settings.line_message_templates, 'holiday_announcement', {
      shop_name: shopName, dates: today, reason,
    });

    // Claim the current record so concurrent cron requests cannot announce it twice.
    const { data: claimed, error: claimError } = await supabase
      .from('shop_holidays')
      .update({ notified_on_day: true })
      .eq('id', holiday.id)
      .eq('notified_on_day', false)
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ skipped: true });

    try {
      const result = await broadcastLineMessage(message);
      if (!result.success) throw new Error(result.error || 'LINE broadcast failed');
    } catch (err) {
      const { error } = await supabase.from('shop_holidays')
        .update({ notified_on_day: false }).eq('id', holiday.id);
      if (error) throw error;
      throw err;
    }

    return NextResponse.json({
      success: true,
      broadcastSent: true,
      holidayDate: today,
      reason,
    });
  } catch (err) {
    console.error('[holiday-notify cron] Error:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถส่งแจ้งเตือนวันหยุดได้' },
      { status: 500 }
    );
  }
}

// รองรับ POST เผื่อทดสอบ manual
export async function POST() {
  return GET();
}
