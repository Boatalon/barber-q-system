import { NextRequest, NextResponse } from 'next/server';
import {
  bookLineQueue,
  cancelLineQueue,
  getLineUserQueueStatus,
  getSystemQueueState,
} from '@/lib/queue-service';
import { getSupabase, type NotificationLogRow } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const lineUserId =
      req.nextUrl.searchParams.get('lineUserId') || 'sim_customer_1';
    const supabase = getSupabase();

    const [state, userStatus, { data: logs }] = await Promise.all([
      getSystemQueueState(),
      getLineUserQueueStatus(lineUserId),
      supabase
        .from('notification_logs')
        .select('*')
        .eq('line_user_id', lineUserId)
        .order('id', { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      lineUserId,
      userStatus,
      userNotifications: (logs as NotificationLogRow[]) ?? [],
      state,
    });
  } catch (err) {
    console.error('[GET /api/line/simulate Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถดึงข้อมูลจำลอง LINE ได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const lineUserId: string = body.lineUserId || 'sim_customer_1';
    const customerLabel: string | undefined = body.customerLabel;
    const action: 'book' | 'status' | 'cancel' = body.action || 'status';

    let actionResult: Record<string, unknown> = {};

    if (action === 'book') {
      const res = await bookLineQueue(lineUserId, customerLabel);
      actionResult = {
        type: 'BOOK',
        isNew: res.isNew,
        queue: res.queue,
        message: res.isNew
          ? `ออกหมายเลขคิว ${res.queue.display_code} สำเร็จ`
          : `คุณมีหมายเลขคิว ${res.queue.display_code} อยู่แล้ว`,
      };
    } else if (action === 'cancel') {
      const res = await cancelLineQueue(lineUserId);
      actionResult = {
        type: 'CANCEL',
        cancelled: res.cancelled,
        queue: res.queue,
        message: res.cancelled
          ? `ยกเลิกคิว ${res.queue?.display_code} เรียบร้อยแล้ว`
          : res.reason,
      };
    } else {
      const status = await getLineUserQueueStatus(lineUserId);
      actionResult = {
        type: 'STATUS',
        status,
      };
    }

    const supabase = getSupabase();
    const [state, userStatus, { data: logs }] = await Promise.all([
      getSystemQueueState(),
      getLineUserQueueStatus(lineUserId),
      supabase
        .from('notification_logs')
        .select('*')
        .eq('line_user_id', lineUserId)
        .order('id', { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      success: true,
      actionResult,
      userStatus,
      userNotifications: (logs as NotificationLogRow[]) ?? [],
      state,
    });
  } catch (err) {
    console.error('[POST /api/line/simulate Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถดำเนินการคำสั่งจำลอง LINE ได้' },
      { status: 500 }
    );
  }
}
