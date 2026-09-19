import { STATUS_LABELS, type TicketStatus } from '@sr/shared';

/** 工单状态标签：色相区分 + 静态圆点 */
export function StatusTag({ status }: { status: TicketStatus }) {
  return (
    <span className="sr-tag" data-status={status}>
      <span className="sr-tag__dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}
