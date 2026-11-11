import type { WorkflowStage, WorkflowTask } from '@/types/workflow';

/**
 * Tìm chu trình phụ thuộc trong cây quy trình.
 * Trả về mảng các key của các task nằm trong chu trình nếu có, ngược lại trả về null.
 */
export function findCycle(stages: WorkflowStage[]): string[] | null {
  if (!stages || stages.length === 0) return null;

  const tasksMap = new Map<string, WorkflowTask>();
  for (const stage of stages) {
    if (!stage.tasks) continue;
    for (const task of stage.tasks) {
      tasksMap.set(task.key, task);
    }
  }

  if (tasksMap.size === 0) return null;

  // 0: Chưa duyệt (UNVISITED), 1: Đang duyệt (VISITING), 2: Đã duyệt xong (VISITED)
  const visited = new Map<string, number>();

  function dfs(node: string, path: string[]): string[] | null {
    visited.set(node, 1);
    path.push(node);

    const task = tasksMap.get(node);
    if (task && task.depends_on) {
      for (const dep of task.depends_on) {
        if (!tasksMap.has(dep)) continue;
        const status = visited.get(dep) || 0;
        if (status === 1) {
          // Tìm thấy chu trình: lấy đoạn từ dep đến hết path
          const cycleStartIndex = path.indexOf(dep);
          return path.slice(cycleStartIndex);
        }
        if (status === 0) {
          const res = dfs(dep, path);
          if (res) return res;
        }
      }
    }

    path.pop();
    visited.set(node, 2);
    return null;
  }

  for (const taskKey of tasksMap.keys()) {
    const status = visited.get(taskKey) || 0;
    if (status === 0) {
      const cycle = dfs(taskKey, []);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Tìm phụ thuộc hướng tới giai đoạn sau (forward dependency).
 * Task ở giai đoạn trước không được phụ thuộc task ở giai đoạn sau.
 */
export function findForwardDependency(
  stages: WorkflowStage[]
): { task: string; dependsOn: string } | null {
  if (!stages || stages.length === 0) return null;

  const taskStageOrder = new Map<string, number>();
  for (const stage of stages) {
    if (!stage.tasks) continue;
    for (const task of stage.tasks) {
      taskStageOrder.set(task.key, stage.order_index);
    }
  }

  for (const stage of stages) {
    if (!stage.tasks) continue;
    for (const task of stage.tasks) {
      if (!task.depends_on) continue;
      for (const dep of task.depends_on) {
        const depStageOrder = taskStageOrder.get(dep);
        if (depStageOrder !== undefined && depStageOrder > stage.order_index) {
          return {
            task: task.key,
            dependsOn: dep,
          };
        }
      }
    }
  }

  return null;
}

export interface ValidationErrorItem {
  field: string;
  message: string;
}

/**
 * Kiểm tra tính hợp lệ của bản nháp quy trình theo các quy tắc nghiệp vụ.
 */
export function validateDraft(stages: WorkflowStage[]): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];
  if (!stages || stages.length === 0) {
    return errors;
  }

  // 1. Kiểm tra order_index của stage liên tục bắt đầu từ 1
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].order_index !== i + 1) {
      errors.push({
        field: `stages[${i}].order_index`,
        message: `Thứ tự giai đoạn phải liên tục bắt đầu từ 1 (hiện tại: ${stages[i].order_index}, mong muốn: ${i + 1})`,
      });
    }
  }

  // 2. Kiểm tra key của stage bị trùng lặp
  const stageKeySeen = new Set<string>();
  for (let i = 0; i < stages.length; i++) {
    const key = stages[i].key;
    if (stageKeySeen.has(key)) {
      errors.push({
        field: `stages[${i}].key`,
        message: `Mã giai đoạn (key) '${key}' bị trùng lặp`,
      });
    } else {
      stageKeySeen.add(key);
    }
  }

  // Thu thập tất cả task key để kiểm tra trùng lặp và ghost dependency
  const allTaskKeys = new Set<string>();
  const duplicateTaskKeys = new Set<string>();

  for (const stage of stages) {
    if (!stage.tasks) continue;
    for (const task of stage.tasks) {
      if (allTaskKeys.has(task.key)) {
        duplicateTaskKeys.add(task.key);
      } else {
        allTaskKeys.add(task.key);
      }
    }
  }

  // Thu thập milestone orders để kiểm tra trùng lặp
  const milestoneOrdersSeen = new Set<number>();
  const duplicateMilestones = new Set<number>();

  for (const stage of stages) {
    if (!stage.tasks) continue;
    for (const task of stage.tasks) {
      if (
        task.triggers_milestone_order !== null &&
        task.triggers_milestone_order !== undefined
      ) {
        if (milestoneOrdersSeen.has(task.triggers_milestone_order)) {
          duplicateMilestones.add(task.triggers_milestone_order);
        } else {
          milestoneOrdersSeen.add(task.triggers_milestone_order);
        }
      }
    }
  }

  // Kiểm tra chi tiết từng task
  for (let sIdx = 0; sIdx < stages.length; sIdx++) {
    const stage = stages[sIdx];
    if (!stage.tasks) continue;

    for (let tIdx = 0; tIdx < stage.tasks.length; tIdx++) {
      const task = stage.tasks[tIdx];
      const taskFieldPrefix = `stages[${sIdx}].tasks[${tIdx}]`;

      // Trùng key task
      if (duplicateTaskKeys.has(task.key)) {
        errors.push({
          field: `${taskFieldPrefix}.key`,
          message: `Mã tác vụ (key) '${task.key}' bị trùng lặp`,
        });
      }

      // SLA <= 0
      if (task.sla_business_days <= 0) {
        errors.push({
          field: `${taskFieldPrefix}.sla_business_days`,
          message: 'SLA phải lớn hơn 0 ngày làm việc',
        });
      }

      // Trọng số complexity_weight ngoài 1-4
      if (task.complexity_weight < 1 || task.complexity_weight > 4) {
        errors.push({
          field: `${taskFieldPrefix}.complexity_weight`,
          message: 'Trọng số phức tạp phải nằm trong khoảng từ 1 đến 4',
        });
      }

      // Phụ thuộc depends_on
      if (task.depends_on && Array.isArray(task.depends_on)) {
        // Tự phụ thuộc
        if (task.depends_on.includes(task.key)) {
          errors.push({
            field: `${taskFieldPrefix}.depends_on`,
            message: 'Tác vụ không thể tự phụ thuộc vào chính nó',
          });
        }

        // Ghost dependency
        for (const dep of task.depends_on) {
          if (!allTaskKeys.has(dep)) {
            errors.push({
              field: `${taskFieldPrefix}.depends_on`,
              message: `Tác vụ phụ thuộc '${dep}' không tồn tại trong bản nháp`,
            });
          }
        }
      }

      // triggers_milestone_order
      if (
        task.triggers_milestone_order !== null &&
        task.triggers_milestone_order !== undefined
      ) {
        if (task.triggers_milestone_order < 1) {
          errors.push({
            field: `${taskFieldPrefix}.triggers_milestone_order`,
            message: 'Đợt kích hoạt mốc thanh toán phải lớn hơn hoặc bằng 1',
          });
        } else if (duplicateMilestones.has(task.triggers_milestone_order)) {
          errors.push({
            field: `${taskFieldPrefix}.triggers_milestone_order`,
            message: `Đợt kích hoạt mốc thanh toán đợt ${task.triggers_milestone_order} bị trùng lặp`,
          });
        }
      }
    }
  }

  return errors;
}
