import { describe, it, expect } from 'vitest';
import { splitSeats, applyLiveEvent } from '@/lib/floorplan';
import type { FloorplanData, FloorplanEvent } from '@/types/floorplan';

function getSampleFloorplanData(): FloorplanData {
  return {
    department: {
      id: 'd1e2f3a4-0000-4000-8000-000000000001',
      name: 'Phòng Sở Hữu Trí Tuệ',
      leader: {
        id: 'usr-01',
        name: 'LS. Nguyễn Văn An',
        title: 'Trưởng Ban SHTT',
        avatar_url: '/api/v1/users/usr-01/avatar',
      },
    },
    stats: {
      total_staff: 3,
      working_count: 2,
      resting_count: 1,
      pending_approvals_count: 2,
    },
    approval_queue: [
      {
        user: {
          id: 'usr-02',
          name: 'LS. Mai Linh',
          title: 'Luật sư Cấp cao',
          avatar_url: '/api/v1/users/usr-02/avatar',
        },
        pending_count: 2,
        requests: [
          {
            id: 'appr-101',
            case_code: 'ASL-2026-TM-0109',
            title: 'Tờ khai đăng ký nhãn hiệu 9OUTFIT',
            requested_at: '2026-10-30T02:15:00Z',
          },
          {
            id: 'appr-102',
            case_code: 'ASL-2026-TM-0110',
            title: 'Gia hạn văn bằng bảo hộ',
            requested_at: '2026-10-30T03:00:00Z',
          },
        ],
      },
    ],
    workstations: [
      {
        desk_index: 1,
        user: {
          id: 'usr-02',
          name: 'LS. Mai Linh',
          title: 'Luật sư Cấp cao',
          avatar_url: '/api/v1/users/usr-02/avatar',
        },
        in_progress_count: 2,
        todo_count: 1,
        is_idle: false,
        is_in_queue: true,
      },
      {
        desk_index: 2,
        user: {
          id: 'usr-03',
          name: 'Trần Thu Hà',
          title: 'Chuyên viên Pháp lý',
          avatar_url: '/api/v1/users/usr-03/avatar',
        },
        in_progress_count: 3,
        todo_count: 2,
        is_idle: false,
        is_in_queue: false,
      },
      {
        desk_index: 3,
        user: {
          id: 'usr-04',
          name: 'Lê Hoàng Nam',
          title: 'Trợ lý Luật sư',
          avatar_url: '/api/v1/users/usr-04/avatar',
        },
        in_progress_count: 0,
        todo_count: 1,
        is_idle: true,
        is_in_queue: false,
      },
    ],
  };
}

describe('Hàm thuần xử lý logic Văn phòng số (lib/floorplan.ts & brief mục 4, 5)', () => {
  describe('splitSeats(data)', () => {
    it('tách danh sách người đứng chờ duyệt (queue) và danh sách bàn (desks)', () => {
      const data = getSampleFloorplanData();
      const result = splitSeats(data);

      expect(result).toHaveProperty('queue');
      expect(result).toHaveProperty('desks');
      expect(Array.isArray(result.queue)).toBe(true);
      expect(Array.isArray(result.desks)).toBe(true);
    });

    it('người có pending_count > 0 đứng ở hàng chờ đúng thứ tự trong approval_queue', () => {
      const data = getSampleFloorplanData();
      // Bổ sung thêm người thứ 2 vào hàng chờ
      data.approval_queue.push({
        user: {
          id: 'usr-03',
          name: 'Trần Thu Hà',
          title: 'Chuyên viên Pháp lý',
        },
        pending_count: 1,
        requests: [
          {
            id: 'appr-103',
            case_code: 'ASL-2026-TM-0115',
            title: 'Hồ sơ khiếu nại từ chối nhãn hiệu',
            requested_at: '2026-10-30T04:00:00Z',
          },
        ],
      });

      const { queue } = splitSeats(data);
      expect(queue.length).toBe(2);
      expect(queue[0].user.id).toBe('usr-02');
      expect(queue[1].user.id).toBe('usr-03');
      expect(queue[0].pending_count).toBe(2);
      expect(queue[1].pending_count).toBe(1);
    });

    it('bàn của người đang có yêu cầu chờ duyệt được đánh dấu is_in_queue = true để hiển thị "Đang trình duyệt" mờ', () => {
      const data = getSampleFloorplanData();
      const { desks } = splitSeats(data);

      const deskUser02 = desks.find((d) => d.user.id === 'usr-02');
      const deskUser03 = desks.find((d) => d.user.id === 'usr-03');

      expect(deskUser02).toBeDefined();
      expect(deskUser02?.is_in_queue).toBe(true);

      expect(deskUser03).toBeDefined();
      expect(deskUser03?.is_in_queue).toBe(false);
    });

    it('người có pending_count = 0 không xuất hiện trong hàng chờ và bàn không bị đánh dấu in_queue', () => {
      const data = getSampleFloorplanData();
      data.approval_queue = [
        {
          user: {
            id: 'usr-02',
            name: 'LS. Mai Linh',
            title: 'Luật sư Cấp cao',
          },
          pending_count: 0,
          requests: [],
        },
      ];

      const { queue, desks } = splitSeats(data);
      expect(queue.length).toBe(0);
      const deskUser02 = desks.find((d) => d.user.id === 'usr-02');
      expect(deskUser02?.is_in_queue).toBe(false);
    });

    it('không thay đổi (mutate) đối tượng đầu vào data (hàm thuần khiết / immutable)', () => {
      const data = getSampleFloorplanData();
      const originalJson = JSON.stringify(data);

      splitSeats(data);

      expect(JSON.stringify(data)).toBe(originalJson);
    });
  });

  describe('applyLiveEvent(data, event)', () => {
    it('trả về đối tượng state mới không làm biến đổi (mutate) dữ liệu gốc', () => {
      const data = getSampleFloorplanData();
      const originalJson = JSON.stringify(data);

      const event: FloorplanEvent = {
        type: 'EVENT_TASK_STATUS_UPDATED',
        payload: {
          user_id: 'usr-03',
          in_progress_count: 4,
          todo_count: 1,
        },
      };

      const updated = applyLiveEvent(data, event);

      expect(updated).not.toBe(data);
      expect(JSON.stringify(data)).toBe(originalJson);
    });

    describe('Sự kiện EVENT_TASK_STATUS_UPDATED', () => {
      it('cập nhật số việc in_progress_count, todo_count và tự động tính is_idle = false khi in_progress_count > 0', () => {
        const data = getSampleFloorplanData();
        const event: FloorplanEvent = {
          type: 'EVENT_TASK_STATUS_UPDATED',
          payload: {
            user_id: 'usr-04', // ban đầu in_progress = 0, is_idle = true
            in_progress_count: 2,
            todo_count: 3,
          },
        };

        const next = applyLiveEvent(data, event);
        const desk = next.workstations.find((w) => w.user.id === 'usr-04');

        expect(desk?.in_progress_count).toBe(2);
        expect(desk?.todo_count).toBe(3);
        expect(desk?.is_idle).toBe(false);
      });

      it('tự động đánh dấu is_idle = true khi in_progress_count == 0 (BR-FLOOR-01)', () => {
        const data = getSampleFloorplanData();
        const event: FloorplanEvent = {
          type: 'EVENT_TASK_STATUS_UPDATED',
          payload: {
            user_id: 'usr-03', // ban đầu in_progress = 3, is_idle = false
            in_progress_count: 0,
            todo_count: 2,
          },
        };

        const next = applyLiveEvent(data, event);
        const desk = next.workstations.find((w) => w.user.id === 'usr-03');

        expect(desk?.in_progress_count).toBe(0);
        expect(desk?.is_idle).toBe(true);
      });

      it('cập nhật lại stats.working_count và stats.resting_count tương ứng với số bàn thực tế', () => {
        const data = getSampleFloorplanData();
        // usr-03 đổi sang 0 in_progress -> working giảm 1, resting tăng 1
        const event: FloorplanEvent = {
          type: 'EVENT_TASK_STATUS_UPDATED',
          payload: {
            user_id: 'usr-03',
            in_progress_count: 0,
            todo_count: 1,
          },
        };

        const next = applyLiveEvent(data, event);
        expect(next.stats.working_count).toBe(1); // usr-02 còn làm việc
        expect(next.stats.resting_count).toBe(2); // usr-03 và usr-04 nghỉ ngơi
      });
    });

    describe('Sự kiện EVENT_APPROVAL_SUBMITTED', () => {
      it('thêm người vào hàng chờ khi chưa có trong approval_queue và tăng pending_count, stats.pending_approvals_count', () => {
        const data = getSampleFloorplanData();
        const newRequest = {
          id: 'appr-201',
          case_code: 'ASL-2026-TM-0200',
          title: 'Hồ sơ đăng ký sáng chế pin mặt trời',
          requested_at: '2026-11-01T08:00:00Z',
        };

        const event: FloorplanEvent = {
          type: 'EVENT_APPROVAL_SUBMITTED',
          payload: {
            user_id: 'usr-03',
            request: newRequest,
          },
        };

        const next = applyLiveEvent(data, event);

        // Kiểm tra stats
        expect(next.stats.pending_approvals_count).toBe(3); // 2 + 1

        // Kiểm tra hàng chờ
        const queueEntry = next.approval_queue.find((q) => q.user.id === 'usr-03');
        expect(queueEntry).toBeDefined();
        expect(queueEntry?.pending_count).toBe(1);
        expect(queueEntry?.requests).toContainEqual(newRequest);

        // Kiểm tra bàn của người này chuyển sang is_in_queue = true
        const desk = next.workstations.find((w) => w.user.id === 'usr-03');
        expect(desk?.is_in_queue).toBe(true);
      });

      it('bổ sung request và tăng pending_count khi người dùng đã có sẵn trong approval_queue', () => {
        const data = getSampleFloorplanData();
        const additionalRequest = {
          id: 'appr-103',
          case_code: 'ASL-2026-TM-0111',
          title: 'Tờ khai bổ sung uỷ quyền',
          requested_at: '2026-11-01T09:00:00Z',
        };

        const event: FloorplanEvent = {
          type: 'EVENT_APPROVAL_SUBMITTED',
          payload: {
            user_id: 'usr-02', // đã có 2 requests
            request: additionalRequest,
          },
        };

        const next = applyLiveEvent(data, event);

        expect(next.stats.pending_approvals_count).toBe(3);
        const queueEntry = next.approval_queue.find((q) => q.user.id === 'usr-02');
        expect(queueEntry?.pending_count).toBe(3);
        expect(queueEntry?.requests.length).toBe(3);
        expect(queueEntry?.requests.some((r) => r.id === 'appr-103')).toBe(true);
      });
    });

    describe('Sự kiện EVENT_APPROVAL_DECIDED', () => {
      it('giảm số lượng request và pending_count nhưng người dùng vẫn ở lại hàng chờ nếu pending_count > 0', () => {
        const data = getSampleFloorplanData(); // usr-02 có 2 requests: appr-101 và appr-102

        const event: FloorplanEvent = {
          type: 'EVENT_APPROVAL_DECIDED',
          payload: {
            user_id: 'usr-02',
            request_id: 'appr-101',
          },
        };

        const next = applyLiveEvent(data, event);

        expect(next.stats.pending_approvals_count).toBe(1); // 2 - 1
        const queueEntry = next.approval_queue.find((q) => q.user.id === 'usr-02');
        expect(queueEntry).toBeDefined();
        expect(queueEntry?.pending_count).toBe(1);
        expect(queueEntry?.requests.length).toBe(1);
        expect(queueEntry?.requests[0].id).toBe('appr-102');

        const desk = next.workstations.find((w) => w.user.id === 'usr-02');
        expect(desk?.is_in_queue).toBe(true);
      });

      it('khi pending_count về 0 thì người dùng rời khỏi hàng chờ và bàn cá nhân hồi vị (is_in_queue = false) (BR-FLOOR-03)', () => {
        const data = getSampleFloorplanData();
        // Chỉ để lại 1 request cho usr-02
        data.approval_queue[0].pending_count = 1;
        data.approval_queue[0].requests = [
          {
            id: 'appr-101',
            case_code: 'ASL-2026-TM-0109',
            title: 'Tờ khai đăng ký nhãn hiệu 9OUTFIT',
            requested_at: '2026-10-30T02:15:00Z',
          },
        ];
        data.stats.pending_approvals_count = 1;

        const event: FloorplanEvent = {
          type: 'EVENT_APPROVAL_DECIDED',
          payload: {
            user_id: 'usr-02',
            request_id: 'appr-101',
          },
        };

        const next = applyLiveEvent(data, event);

        expect(next.stats.pending_approvals_count).toBe(0);
        // usr-02 rời khỏi hàng chờ
        const queueEntry = next.approval_queue.find((q) => q.user.id === 'usr-02');
        expect(queueEntry).toBeUndefined();
        expect(next.approval_queue.length).toBe(0);

        // Bàn cá nhân trở về bình thường (không còn vắng/mờ)
        const desk = next.workstations.find((w) => w.user.id === 'usr-02');
        expect(desk?.is_in_queue).toBe(false);
      });

      it('giảm pending_approvals_count không bao giờ âm khi có quyết định trùng lặp', () => {
        const data = getSampleFloorplanData();
        data.stats.pending_approvals_count = 0;
        data.approval_queue = [];

        const event: FloorplanEvent = {
          type: 'EVENT_APPROVAL_DECIDED',
          payload: {
            user_id: 'usr-unknown',
            request_id: 'appr-nonexistent',
          },
        };

        const next = applyLiveEvent(data, event);
        expect(next.stats.pending_approvals_count).toBe(0);
      });
    });

    describe('Xử lý ngoại lệ và sự kiện không xác định', () => {
      it('trả về bản sao an toàn khi gặp sự kiện không xác định', () => {
        const data = getSampleFloorplanData();
        const unknownEvent = {
          type: 'UNKNOWN_EVENT_TYPE',
          payload: {},
        } as unknown as FloorplanEvent;

        const next = applyLiveEvent(data, unknownEvent);
        expect(next).toEqual(data);
      });
    });
  });
});
