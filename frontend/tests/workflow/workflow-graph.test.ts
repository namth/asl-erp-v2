import { describe, it, expect } from 'vitest';
import {
  findCycle,
  findForwardDependency,
  validateDraft,
} from '@/lib/workflow-graph';
import type { WorkflowStage, WorkflowTask } from '@/types/workflow';

describe('Thuật toán đồ thị quy trình - workflow-graph.ts (brief mục 4, 5 & §3.3a)', () => {
  describe('findCycle(stages)', () => {
    it('trả về null khi quy trình rỗng hoặc không có task nào', () => {
      expect(findCycle([])).toBeNull();
      expect(
        findCycle([
          {
            key: 's1',
            name: 'Giai đoạn 1',
            order_index: 1,
            requires_approval: false,
            tasks: [],
          },
        ])
      ).toBeNull();
    });

    it('trả về null khi các task có phụ thuộc tuyến tính hợp lệ (không chu trình)', () => {
      const stages: WorkflowStage[] = [
        {
          key: 's1',
          name: 'Giai đoạn 1',
          order_index: 1,
          requires_approval: true,
          tasks: [
            {
              key: 't1',
              title: 'Task 1',
              default_case_role: 'EXECUTOR',
              sla_business_days: 2,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: [],
            },
            {
              key: 't2',
              title: 'Task 2',
              default_case_role: 'CASE_MANAGER',
              sla_business_days: 3,
              complexity_weight: 2,
              requires_approval: false,
              triggers_milestone_order: 1,
              depends_on: ['t1'],
            },
          ],
        },
        {
          key: 's2',
          name: 'Giai đoạn 2',
          order_index: 2,
          requires_approval: false,
          tasks: [
            {
              key: 't3',
              title: 'Task 3',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t2'],
            },
          ],
        },
      ];

      expect(findCycle(stages)).toBeNull();
    });

    it('trả về null với đồ thị phân nhánh phức tạp DAG (Diamond/Fork-Join) không chu trình', () => {
      // t1 -> t2, t1 -> t3; t4 depends on [t2, t3]
      const stages: WorkflowStage[] = [
        {
          key: 's1',
          name: 'Tiếp nhận',
          order_index: 1,
          requires_approval: false,
          tasks: [
            {
              key: 't1',
              title: 'Khởi tạo hồ sơ',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: [],
            },
            {
              key: 't2',
              title: 'Tra cứu sơ bộ',
              default_case_role: 'EXECUTOR',
              sla_business_days: 2,
              complexity_weight: 2,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t1'],
            },
            {
              key: 't3',
              title: 'Xác minh thông tin đối tác',
              default_case_role: 'EXECUTOR',
              sla_business_days: 2,
              complexity_weight: 2,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t1'],
            },
            {
              key: 't4',
              title: 'Tổng hợp báo cáo thẩm định',
              default_case_role: 'CASE_MANAGER',
              sla_business_days: 1,
              complexity_weight: 3,
              requires_approval: true,
              triggers_milestone_order: 1,
              depends_on: ['t2', 't3'],
            },
          ],
        },
      ];

      expect(findCycle(stages)).toBeNull();
    });

    it('phát hiện chu trình 2 task (t1 phụ thuộc t2, t2 phụ thuộc t1) và trả về đúng danh sách key', () => {
      const stages: WorkflowStage[] = [
        {
          key: 's1',
          name: 'Giai đoạn 1',
          order_index: 1,
          requires_approval: false,
          tasks: [
            {
              key: 't1',
              title: 'Soạn thảo đơn',
              default_case_role: 'EXECUTOR',
              sla_business_days: 2,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t2'],
            },
            {
              key: 't2',
              title: 'Duyệt tài liệu đính kèm',
              default_case_role: 'CASE_MANAGER',
              sla_business_days: 1,
              complexity_weight: 2,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t1'],
            },
          ],
        },
      ];

      const cycle = findCycle(stages);
      expect(cycle).not.toBeNull();
      expect(cycle).toHaveLength(2);
      expect(cycle).toContain('t1');
      expect(cycle).toContain('t2');
    });

    it('phát hiện chu trình 3 task (t1 -> t2 -> t3 -> t1) và trả về đúng các key tham gia chu trình', () => {
      const stages: WorkflowStage[] = [
        {
          key: 's1',
          name: 'Giai đoạn 1',
          order_index: 1,
          requires_approval: false,
          tasks: [
            {
              key: 't1',
              title: 'Task A',
              default_case_role: 'EXECUTOR',
              sla_business_days: 2,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t3'], // t3 -> t1
            },
            {
              key: 't2',
              title: 'Task B',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t1'], // t1 -> t2
            },
            {
              key: 't3',
              title: 'Task C',
              default_case_role: 'CASE_MANAGER',
              sla_business_days: 3,
              complexity_weight: 2,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t2'], // t2 -> t3
            },
          ],
        },
      ];

      const cycle = findCycle(stages);
      expect(cycle).not.toBeNull();
      expect(cycle).toHaveLength(3);
      expect(cycle).toContain('t1');
      expect(cycle).toContain('t2');
      expect(cycle).toContain('t3');
    });

    it('phát hiện chu trình nằm ở một nhánh con trong đồ thị lớn gồm cả task hợp lệ', () => {
      const stages: WorkflowStage[] = [
        {
          key: 's1',
          name: 'Giai đoạn 1',
          order_index: 1,
          requires_approval: false,
          tasks: [
            {
              key: 't_clean_1',
              title: 'Task sạch 1',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: [],
            },
            {
              key: 't_clean_2',
              title: 'Task sạch 2',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t_clean_1'],
            },
            {
              key: 't_cycle_a',
              title: 'Task vòng lặp A',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t_cycle_b'],
            },
            {
              key: 't_cycle_b',
              title: 'Task vòng lặp B',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t_cycle_a'],
            },
          ],
        },
      ];

      const cycle = findCycle(stages);
      expect(cycle).not.toBeNull();
      expect(cycle).toContain('t_cycle_a');
      expect(cycle).toContain('t_cycle_b');
      expect(cycle).not.toContain('t_clean_1');
      expect(cycle).not.toContain('t_clean_2');
    });
  });

  describe('findForwardDependency(stages)', () => {
    it('trả về null khi các phụ thuộc chỉ hướng về task ở cùng stage hoặc stage trước', () => {
      const stages: WorkflowStage[] = [
        {
          key: 's1',
          name: 'Stage 1',
          order_index: 1,
          requires_approval: false,
          tasks: [
            {
              key: 't1',
              title: 'Task 1',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: [],
            },
            {
              key: 't2',
              title: 'Task 2 cùng stage phụ thuộc t1',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t1'],
            },
          ],
        },
        {
          key: 's2',
          name: 'Stage 2',
          order_index: 2,
          requires_approval: false,
          tasks: [
            {
              key: 't3',
              title: 'Task 3 ở stage 2 phụ thuộc task t2 ở stage 1',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t2'],
            },
          ],
        },
      ];

      expect(findForwardDependency(stages)).toBeNull();
    });

    it('bắt phụ thuộc sang stage sau: task ở stage 1 phụ thuộc task ở stage 2', () => {
      const stages: WorkflowStage[] = [
        {
          key: 's1',
          name: 'Giai đoạn 1',
          order_index: 1,
          requires_approval: false,
          tasks: [
            {
              key: 't1',
              title: 'Task ở stage 1 nhưng lại phụ thuộc task t3 ở stage 2',
              default_case_role: 'EXECUTOR',
              sla_business_days: 2,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t3'], // Forward dependency vi phạm!
            },
          ],
        },
        {
          key: 's2',
          name: 'Giai đoạn 2',
          order_index: 2,
          requires_approval: false,
          tasks: [
            {
              key: 't3',
              title: 'Task ở stage 2',
              default_case_role: 'CASE_MANAGER',
              sla_business_days: 3,
              complexity_weight: 2,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: [],
            },
          ],
        },
      ];

      const forward = findForwardDependency(stages);
      expect(forward).not.toBeNull();
      expect(forward).toEqual({
        task: 't1',
        dependsOn: 't3',
      });
    });

    it('bắt phụ thuộc nhảy cóc sang stage 3: task ở stage 1 phụ thuộc stage 3', () => {
      const stages: WorkflowStage[] = [
        {
          key: 's1',
          name: 'Giai đoạn 1',
          order_index: 1,
          requires_approval: false,
          tasks: [
            {
              key: 't1',
              title: 'Task 1',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: ['t5'], // t5 thuộc stage 3
            },
          ],
        },
        {
          key: 's2',
          name: 'Giai đoạn 2',
          order_index: 2,
          requires_approval: false,
          tasks: [
            {
              key: 't3',
              title: 'Task 3',
              default_case_role: 'EXECUTOR',
              sla_business_days: 1,
              complexity_weight: 1,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: [],
            },
          ],
        },
        {
          key: 's3',
          name: 'Giai đoạn 3',
          order_index: 3,
          requires_approval: false,
          tasks: [
            {
              key: 't5',
              title: 'Task 5 ở stage 3',
              default_case_role: 'SUPERVISOR',
              sla_business_days: 2,
              complexity_weight: 3,
              requires_approval: false,
              triggers_milestone_order: null,
              depends_on: [],
            },
          ],
        },
      ];

      const forward = findForwardDependency(stages);
      expect(forward).not.toBeNull();
      expect(forward?.task).toBe('t1');
      expect(forward?.dependsOn).toBe('t5');
    });
  });

  describe('validateDraft(stages)', () => {
    const validStage: WorkflowStage = {
      key: 's1',
      name: 'Tiếp nhận hồ sơ',
      order_index: 1,
      requires_approval: true,
      tasks: [
        {
          key: 't1',
          title: 'Kiểm tra tài liệu ban đầu',
          default_case_role: 'EXECUTOR',
          sla_business_days: 2,
          complexity_weight: 2,
          requires_approval: false,
          triggers_milestone_order: null,
          depends_on: [],
        },
        {
          key: 't2',
          title: 'Soạn tờ khai mẫu 01',
          default_case_role: 'EXECUTOR',
          sla_business_days: 3,
          complexity_weight: 3,
          requires_approval: true,
          triggers_milestone_order: 1,
          depends_on: ['t1'],
        },
      ],
    };

    it('trả về mảng lỗi rỗng khi bản nháp hợp lệ đầy đủ tiêu chuẩn §3.3a', () => {
      const errors = validateDraft([validStage]);
      expect(errors).toEqual([]);
    });

    it('bắt lỗi khi order_index của stage không liên tục bắt đầu từ 1', () => {
      // Trường hợp 1: Bắt đầu từ 2 thay vì 1
      const stageStartAt2: WorkflowStage[] = [
        { ...validStage, order_index: 2 },
      ];
      const errors1 = validateDraft(stageStartAt2) as Array<{ field: string; message: string }>;
      expect(errors1.some((e) => e.field.includes('order_index'))).toBe(true);

      // Trường hợp 2: Thứ tự bị ngắt quãng [1, 3]
      const stagesGap: WorkflowStage[] = [
        { ...validStage, key: 's1', order_index: 1 },
        { ...validStage, key: 's2', order_index: 3 },
      ];
      const errors2 = validateDraft(stagesGap) as Array<{ field: string; message: string }>;
      expect(errors2.some((e) => e.field.includes('order_index'))).toBe(true);
    });

    it('bắt lỗi khi key của stage bị trùng lặp', () => {
      const stagesDuplicateKey: WorkflowStage[] = [
        { ...validStage, key: 's1', order_index: 1 },
        { ...validStage, key: 's1', order_index: 2 },
      ];
      const errors = validateDraft(stagesDuplicateKey) as Array<{ field: string; message: string }>;
      expect(errors.some((e) => e.field.includes('key'))).toBe(true);
    });

    it('bắt lỗi khi key của task bị trùng lặp trong cùng stage hoặc giữa các stage', () => {
      const stagesDuplicateTaskKey: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            { ...validStage.tasks[0], key: 't_dup' },
            { ...validStage.tasks[1], key: 't_dup' },
          ],
        },
      ];
      const errors = validateDraft(stagesDuplicateTaskKey) as Array<{ field: string; message: string }>;
      expect(errors.some((e) => e.field.includes('key'))).toBe(true);
    });

    it('bắt lỗi SLA ngày làm việc <= 0 (sla_business_days = 0 hoặc âm)', () => {
      const stageZeroSla: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            {
              ...validStage.tasks[0],
              sla_business_days: 0,
            },
          ],
        },
      ];
      const errorsZero = validateDraft(stageZeroSla) as Array<{ field: string; message: string }>;
      expect(errorsZero.some((e) => e.field.includes('sla_business_days'))).toBe(true);

      const stageNegativeSla: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            {
              ...validStage.tasks[0],
              sla_business_days: -3,
            },
          ],
        },
      ];
      const errorsNeg = validateDraft(stageNegativeSla) as Array<{ field: string; message: string }>;
      expect(errorsNeg.some((e) => e.field.includes('sla_business_days'))).toBe(true);
    });

    it('bắt lỗi trọng số phức tạp complexity_weight nằm ngoài khoảng 1–4', () => {
      // Dưới 1
      const stageWeightZero: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            {
              ...validStage.tasks[0],
              complexity_weight: 0,
            },
          ],
        },
      ];
      const errorsZero = validateDraft(stageWeightZero) as Array<{ field: string; message: string }>;
      expect(errorsZero.some((e) => e.field.includes('complexity_weight'))).toBe(true);

      // Trên 4
      const stageWeightFive: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            {
              ...validStage.tasks[0],
              complexity_weight: 5,
            },
          ],
        },
      ];
      const errorsFive = validateDraft(stageWeightFive) as Array<{ field: string; message: string }>;
      expect(errorsFive.some((e) => e.field.includes('complexity_weight'))).toBe(true);
    });

    it('bắt lỗi khi task có depends_on trỏ tới key lạ không tồn tại trong bản nháp', () => {
      const stageGhostDep: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            {
              ...validStage.tasks[0],
              depends_on: ['t_khong_ton_tai_trong_cay'],
            },
          ],
        },
      ];
      const errors = validateDraft(stageGhostDep) as Array<{ field: string; message: string }>;
      expect(errors.some((e) => e.field.includes('depends_on'))).toBe(true);
    });

    it('bắt lỗi tự phụ thuộc (task tự phụ thuộc chính key của nó)', () => {
      const stageSelfDep: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            {
              ...validStage.tasks[0],
              key: 't_self',
              depends_on: ['t_self'],
            },
          ],
        },
      ];
      const errors = validateDraft(stageSelfDep) as Array<{ field: string; message: string }>;
      expect(errors.some((e) => e.field.includes('depends_on'))).toBe(true);
    });

    it('bắt lỗi triggers_milestone_order < 1 hoặc bị trùng lặp giữa các task', () => {
      // triggers_milestone_order = 0
      const stageZeroMilestone: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            {
              ...validStage.tasks[0],
              triggers_milestone_order: 0,
            },
          ],
        },
      ];
      const errorsZero = validateDraft(stageZeroMilestone) as Array<{ field: string; message: string }>;
      expect(errorsZero.some((e) => e.field.includes('triggers_milestone_order'))).toBe(true);

      // Trùng lặp đợt kích hoạt (hai task cùng kích hoạt đợt 1)
      const stageDuplicateMilestone: WorkflowStage[] = [
        {
          ...validStage,
          tasks: [
            {
              ...validStage.tasks[0],
              triggers_milestone_order: 1,
            },
            {
              ...validStage.tasks[1],
              triggers_milestone_order: 1,
            },
          ],
        },
      ];
      const errorsDup = validateDraft(stageDuplicateMilestone) as Array<{ field: string; message: string }>;
      expect(errorsDup.some((e) => e.field.includes('triggers_milestone_order'))).toBe(true);
    });
  });
});
