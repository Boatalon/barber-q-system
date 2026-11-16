/**
 * GET /api/cron/holiday-notify
 *
 * เรียกโดย Vercel Cron ทุกวันเวลา 09:00 ICT (02:00 UTC)
 * ตรวจสอบว่าวันนี้เป็นวันหยุดที่ตั้งล่วงหน้าไว้หรือไม่
 * ถ้าใช่และยังไม่ได้แจ้งในวันนี้ (notified_on_day = false) → broadcast LINE แล้วอัปเดต flag เป็น true
 * ป้องกันการส่งซ้ำเมื่อช่างกดหยุดด่วน (closeShopToday จะตั้ง notified_on_day = true ไว้แล้ว)
 */
import { NextResponse } from 'next/server';
import { getSettings, formatShopDisplayName } from '@/lib/queue-service';
import { getSupabase, getTodayDateString, type ShopHolidayRow } from '@/lib/db';
import { broadcastLineMessage } from '@/lib/line';

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
    const message =
      `📢 ประกาศจากร้าน ${shopName}\n` +
      `วันนี้ทางร้านหยุดให้บริการ 1 วัน (${reason}) นะครับ\n` +
      `ขออภัยในความไม่สะดวก แล้วพบกันใหม่วันพรุ่งนี้ครับ 💈✂️`;

    const broadcastResult = await broadcastLineMessage(message);

    // อัปเดต notified_on_day = true เพื่อไม่ให้ส่งซ้ำ
    await supabase
      .from('shop_holidays')
      .update({ notified_on_day: true })
      .eq('holiday_date', today);

    return NextResponse.json({
      success: true,
      broadcastSent: broadcastResult.success,
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
