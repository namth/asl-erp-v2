import type { Task, TaskStateContext, TaskStatus } from '@/types/tasks';

/**
 * Tính toán các trạng thái kế tiếp hợp lệ của một tác vụ
 * Tuân thủ docs/12 §1.4, §2.1-2.4 và DEC-07
 */
export function nextStatuses(task: Task, context: TaskStateContext): TaskStatus[] {
  const { stageStatus, caseStatus, isLegacy } = context;

  // Vụ việc lịch sử hoặc đã đóng / chấm dứt không được thay đổi trạng thái
  if (isLegacy || caseStatus === 'CLOSED' || caseStatus === 'TERMINATED') {
    return [];
  }

  // Vụ việc tạm dừng không được thay đổi trạng thái
  if (caseStatus === 'PAUSED' || caseStatus !== 'ACTIVE') {
    return [];
  }

  // Giai đoạn phải ở trạng thái ACTIVE mới được thực hiện tác vụ bên trong
  if (stageStatus !== 'ACTIVE') {
    return [];
  }

  const blockedBy = Array.isArray(task.blocked_by) ? task.blocked_by : [];

  switch (task.status) {
    case 'TODO':
      // Nếu có task tiên quyết chưa hoàn thành (bị chặn) thì không thể chuyển sang IN_PROGRESS
      if (blockedBy.length > 0) {
        return [];
      }
      return ['IN_PROGRESS'];

    case 'IN_PROGRESS':
      // Nếu yêu cầu phê duyệt thì chuyển sang WAITING_APPROVAL, ngược lại chuyển thẳng COMPLETED
      if (task.requires_approval) {
        return ['WAITING_APPROVAL'];
      }
      return ['COMPLETED'];

    case 'WAITING_APPROVAL':
      // Trạng thái chờ phê duyệt không chuyển tiếp qua menu trực tiếp của thẻ
      // mà phải qua phê duyệt hoặc trả về bởi người có thẩm quyền
      return [];

    case 'COMPLETED':
      // Đã hoàn thành thì không chuyển tiếp
      return [];

    default:
      return [];
  }
}
