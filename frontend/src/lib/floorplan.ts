/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ApprovalQueueItem,
  FloorplanData,
  FloorplanEvent,
  WorkstationDesk,
} from '@/types/floorplan';

/**
 * Tách danh sách hàng chờ duyệt và bàn nhân viên,
 * đánh dấu trạng thái is_in_queue trên bàn tương ứng.
 */
export function splitSeats(data: FloorplanData): {
  queue: ApprovalQueueItem[];
  desks: WorkstationDesk[];
} {
  const queue = (data.approval_queue || [])
    .filter((item) => item.pending_count > 0)
    .map((item) => ({
      ...item,
      requests: [...item.requests],
    }));

  const queueUserIds = new Set(queue.map((item) => item.user.id));

  const desks = (data.workstations || []).map((desk) => ({
    ...desk,
    is_in_queue: queueUserIds.has(desk.user.id),
  }));

  return { queue, desks };
}

/**
 * Áp dụng sự kiện thời gian thực (live event) vào FloorplanData mà không làm mutate dữ liệu gốc.
 */
export function applyLiveEvent(data: FloorplanData, event: FloorplanEvent): FloorplanData {
  if (!event || !event.type) {
    return { ...data };
  }

  switch (event.type) {
    case 'EVENT_TASK_STATUS_UPDATED': {
      const { user_id, in_progress_count, todo_count } = event.payload;

      const nextWorkstations = (data.workstations || []).map((w) => {
        if (w.user.id !== user_id) {
          return w;
        }
        return {
          ...w,
          in_progress_count,
          todo_count,
          is_idle: in_progress_count === 0,
        };
      });

      const working_count = nextWorkstations.filter((w) => !w.is_idle).length;
      const resting_count = nextWorkstations.filter((w) => w.is_idle).length;

      return {
        ...data,
        stats: {
          ...data.stats,
          working_count,
          resting_count,
        },
        workstations: nextWorkstations,
      };
    }

    case 'EVENT_APPROVAL_SUBMITTED': {
      const { user_id, request } = event.payload;
      const nextPendingApprovals = (data.stats.pending_approvals_count || 0) + 1;

      const queueIndex = (data.approval_queue || []).findIndex((q) => q.user.id === user_id);
      let nextQueue: ApprovalQueueItem[];

      if (queueIndex >= 0) {
        nextQueue = data.approval_queue.map((q, idx) => {
          if (idx !== queueIndex) return q;
          return {
            ...q,
            pending_count: q.pending_count + 1,
            requests: [...q.requests, request],
          };
        });
      } else {
        const desk = data.workstations.find((w) => w.user.id === user_id);
        const user = desk
          ? { ...desk.user }
          : { id: user_id, name: '', title: '' };

        nextQueue = [
          ...data.approval_queue,
          {
            user,
            pending_count: 1,
            requests: [request],
          },
        ];
      }

      const nextWorkstations = data.workstations.map((w) => {
        if (w.user.id === user_id) {
          return { ...w, is_in_queue: true };
        }
        return w;
      });

      return {
        ...data,
        stats: {
          ...data.stats,
          pending_approvals_count: nextPendingApprovals,
        },
        approval_queue: nextQueue,
        workstations: nextWorkstations,
      };
    }

    case 'EVENT_APPROVAL_DECIDED': {
      const { user_id, request_id } = event.payload;
      const nextPendingApprovals = Math.max(0, (data.stats.pending_approvals_count || 0) - 1);

      const queueIndex = (data.approval_queue || []).findIndex((q) => q.user.id === user_id);
      let nextQueue: ApprovalQueueItem[] = [...data.approval_queue];
      let userLeftQueue = false;

      if (queueIndex >= 0) {
        const current = data.approval_queue[queueIndex];
        const nextRequests = current.requests.filter((r) => r.id !== request_id);
        const nextPendingCount = Math.max(0, current.pending_count - 1);

        if (nextPendingCount === 0 || nextRequests.length === 0) {
          nextQueue = nextQueue.filter((_, idx) => idx !== queueIndex);
          userLeftQueue = true;
        } else {
          nextQueue[queueIndex] = {
            ...current,
            pending_count: nextPendingCount,
            requests: nextRequests,
          };
        }
      }

      const nextWorkstations = data.workstations.map((w) => {
        if (w.user.id === user_id && userLeftQueue) {
          return { ...w, is_in_queue: false };
        }
        return w;
      });

      return {
        ...data,
        stats: {
          ...data.stats,
          pending_approvals_count: nextPendingApprovals,
        },
        approval_queue: nextQueue,
        workstations: nextWorkstations,
      };
    }

    default:
      return { ...data };
  }
}
