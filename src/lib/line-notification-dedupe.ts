export function wasNearNoticeSent(
  logs: ReadonlyArray<{ queue_id: number; queues_ahead: number | null; message: string }>,
  queueId: number,
  queuesAhead: number
): boolean {
  return logs.some((log) =>
    log.queue_id === queueId &&
    (log.queues_ahead === queuesAhead ||
      (log.queues_ahead === null && new RegExp(`เหลืออีก(?:เพียง)? ${queuesAhead} คิว`).test(log.message)))
  );
}
