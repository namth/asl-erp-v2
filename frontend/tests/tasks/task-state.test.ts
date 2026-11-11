import { describe, it, expect } from 'vitest';
import { nextStatuses } from '@/lib/task-state';
import type { Task, TaskStatus } from '@/types/tasks';

describe('Máy trạng thái tác vụ - task-state.ts (brief mục 4, 5 & 12 §1.4, §2.1-2.4)', () => {
  const baseTask: Task = {
    id: 'task-001',
    stage_id: 'stage-01',
    title: 'Soạn thảo tờ khai đăng ký nhãn hiệu',
    status: 'TODO',
    requires_approval: false,
    depends_on: [],
    blocked_by: [],
    is_ad_hoc: false,
    sla_business_days: 2,
    complexity_weight: 1,
  };

  describe('Ràng buộc cấp giai đoạn (stageStatus) và cấp vụ việc (caseStatus)', () => {
    it('trả về mảng rỗng [] khi giai đoạn không ở trạng thái ACTIVE (bị LOCKED do chờ thanh toán hoặc chưa mở)', () => {
      const lockedStatuses = ['LOCKED', 'WAITING_PAYMENT', 'WAITING_APPROVAL', 'COMPLETED', 'PENDING'];

      lockedStatuses.forEach((stageStatus) => {
        const statuses = nextStatuses(
          { ...baseTask, status: 'TODO', blocked_by: [] },
          { stageStatus, caseStatus: 'ACTIVE', isLegacy: false }
        );
        expect(statuses).toEqual([]);
      });
    });

    it('trả về mảng rỗng [] khi vụ việc đang tạm dừng (caseStatus = PAUSED)', () => {
      const statusesTodo = nextStatuses(
        { ...baseTask, status: 'TODO', blocked_by: [] },
        { stageStatus: 'ACTIVE', caseStatus: 'PAUSED', isLegacy: false }
      );
      expect(statusesTodo).toEqual([]);

      const statusesInProgress = nextStatuses(
        { ...baseTask, status: 'IN_PROGRESS', requires_approval: false },
        { stageStatus: 'ACTIVE', caseStatus: 'PAUSED', isLegacy: false }
      );
      expect(statusesInProgress).toEqual([]);
    });

    it('trả về mảng rỗng [] khi vụ việc là vụ việc lịch sử (is_legacy = true hoặc caseStatus = CLOSED / TERMINATED)', () => {
      const legacyResult = nextStatuses(
        { ...baseTask, status: 'TODO', blocked_by: [] },
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: true }
      );
      expect(legacyResult).toEqual([]);

      const closedResult = nextStatuses(
        { ...baseTask, status: 'IN_PROGRESS' },
        { stageStatus: 'ACTIVE', caseStatus: 'CLOSED', isLegacy: false }
      );
      expect(closedResult).toEqual([]);

      const terminatedResult = nextStatuses(
        { ...baseTask, status: 'IN_PROGRESS' },
        { stageStatus: 'ACTIVE', caseStatus: 'TERMINATED', isLegacy: false }
      );
      expect(terminatedResult).toEqual([]);
    });
  });

  describe('Chuyển trạng thái từ TODO', () => {
    it('TODO -> [IN_PROGRESS] khi stage ACTIVE, case ACTIVE và blocked_by rỗng', () => {
      const result = nextStatuses(
        { ...baseTask, status: 'TODO', blocked_by: [] },
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: false }
      );
      expect(result).toEqual(['IN_PROGRESS']);
    });

    it('TODO -> [] khi blocked_by có ít nhất một task tiên quyết chưa xong (bị khoá phụ thuộc)', () => {
      const resultSingleBlocked = nextStatuses(
        { ...baseTask, status: 'TODO', blocked_by: ['task-pre-01'] },
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: false }
      );
      expect(resultSingleBlocked).toEqual([]);

      const resultMultiBlocked = nextStatuses(
        { ...baseTask, status: 'TODO', blocked_by: ['task-pre-01', 'task-pre-02'] },
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: false }
      );
      expect(resultMultiBlocked).toEqual([]);
    });
  });

  describe('Chuyển trạng thái từ IN_PROGRESS', () => {
    it('IN_PROGRESS -> [WAITING_APPROVAL] khi requires_approval = true', () => {
      const result = nextStatuses(
        { ...baseTask, status: 'IN_PROGRESS', requires_approval: true },
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: false }
      );
      expect(result).toEqual(['WAITING_APPROVAL']);
    });

    it('IN_PROGRESS -> [COMPLETED] khi requires_approval = false (không cần duyệt)', () => {
      const result = nextStatuses(
        { ...baseTask, status: 'IN_PROGRESS', requires_approval: false },
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: false }
      );
      expect(result).toEqual(['COMPLETED']);
    });
  });

  describe('Trạng thái kết thúc hoặc chờ duyệt trên menu thẻ task', () => {
    it('WAITING_APPROVAL -> [] (chờ người có thẩm quyền phê duyệt / trả về qua hộp thoại duyệt)', () => {
      const result = nextStatuses(
        { ...baseTask, status: 'WAITING_APPROVAL', requires_approval: true },
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: false }
      );
      expect(result).toEqual([]);
    });

    it('COMPLETED -> [] (trạng thái hoàn tất không chuyển tiếp)', () => {
      const result = nextStatuses(
        { ...baseTask, status: 'COMPLETED' },
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: false }
      );
      expect(result).toEqual([]);
    });
  });

  describe('Tính toàn vẹn (immutability) & kiểm tra chống lách', () => {
    it('không làm đột biến (mutate) đối tượng task hay context đầu vào', () => {
      const taskCopy = { ...baseTask, blocked_by: ['t-1'] };
      const contextCopy = { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE', isLegacy: false };

      Object.freeze(taskCopy);
      Object.freeze(contextCopy);

      expect(() => nextStatuses(taskCopy, contextCopy)).not.toThrow();
    });

    it('xử lý an toàn khi blocked_by là undefined (coi như không bị chặn)', () => {
      const taskWithoutBlockedBy = { ...baseTask, blocked_by: undefined as any };
      const result = nextStatuses(
        taskWithoutBlockedBy,
        { stageStatus: 'ACTIVE', caseStatus: 'ACTIVE' }
      );
      expect(result).toEqual(['IN_PROGRESS']);
    });
  });
});
