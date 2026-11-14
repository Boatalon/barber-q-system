import { NextRequest, NextResponse } from 'next/server';
import { cancelQueueById, getSystemQueueState } from '@/lib/queue-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const queueId = Number(body.queueId);
    if (!queueId || Number.isNaN(queueId)) {
      return NextResponse.json(
        { error: 'กรุณาระบุรหัสคิวที่ต้องการยกเลิก' },
        { status: 400 }
      );
    }

    const result = await cancelQueueById(queueId, {
      noShow: Boolean(body.noShow),
    });
    const state = await getSystemQueueState();

    if (!result.cancelled) {
      return NextResponse.json(
        { error: result.reason || 'ไม่สามารถยกเลิกคิวได้', state },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      cancelledQueue: result.queue,
      state,
    });
  } catch (err) {
    console.error('[POST /api/queue/cancel Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถยกเลิกคิวได้' },
      { status: 500 }
    );
  }
}

