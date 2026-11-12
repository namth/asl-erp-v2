"""Thuật toán thuần cho đồ thị quy trình (Workflow Graph) - kiểm tra chu trình và phụ thuộc giai đoạn."""
from typing import Dict, List, Optional, Tuple, Set

def find_cycle(deps: Dict[str, List[str]]) -> Optional[List[str]]:
    """Tìm chu trình trong đồ thị phụ thuộc giữa các task.
    
    deps: Dict mapping task_key -> list các task_key mà nó phụ thuộc vào (depends_on).
    Nếu có quan hệ t2 depends on t1, cạnh hướng từ t2 -> t1 (hoặc t1 -> t2).
    Ở đây nếu t2 phụ thuộc t1, thì t1 phải hoàn thành trước t2.
    Nếu t1 phụ thuộc t2 và t2 phụ thuộc t1: t1 -> t2 và t2 -> t1 => chu trình.
    
    Trả về danh sách các key trong chu trình, hoặc None nếu không có chu trình.
    """
    # Xây dựng danh sách tất cả các đỉnh
    all_nodes: Set[str] = set(deps.keys())
    for targets in deps.values():
        all_nodes.update(targets)

    # 0 = unvisited, 1 = visiting (in stack), 2 = visited
    state: Dict[str, int] = {node: 0 for node in all_nodes}
    parent: Dict[str, Optional[str]] = {node: None for node in all_nodes}
    cycle: List[str] = []

    def dfs(u: str, path: List[str]) -> bool:
        state[u] = 1
        path.append(u)
        for v in deps.get(u, []):
            if state.get(v, 0) == 1:
                # Tìm thấy cạnh ngược (back-edge) u -> v => có chu trình
                # Trích xuất chu trình từ v tới u
                cycle_idx = path.index(v)
                cycle.extend(path[cycle_idx:])
                return True
            elif state.get(v, 0) == 0:
                parent[v] = u
                if dfs(v, path):
                    return True
        state[u] = 2
        path.pop()
        return False

    for node in sorted(all_nodes):
        if state[node] == 0:
            if dfs(node, []):
                return cycle

    return None

def detect_cycle(deps: Dict[str, List[str]]) -> Optional[List[str]]:
    """Bí danh cho find_cycle."""
    return find_cycle(deps)

def validate_graph(deps: Dict[str, List[str]]) -> Tuple[bool, Optional[List[str]]]:
    """Kiểm tra tính hợp lệ của đồ thị phụ thuộc (không chu trình).
    
    Trả về:
        (True, None) nếu hợp lệ.
        (False, cycle_nodes) nếu có chu trình.
    """
    cycle = find_cycle(deps)
    if cycle:
        return False, cycle
    return True, None

def validate_stage_dependencies(stages: List[dict]) -> Tuple[bool, Optional[str]]:
    """Kiểm tra: Task ở stage trước không được phụ thuộc task ở stage sau.
    
    stages: danh sách các stage (dict có 'key', 'order_index', 'tasks').
    Trả về (True, None) nếu hợp lệ, (False, "INVALID_DEPENDENCY") nếu vi phạm.
    """
    task_to_stage_order: Dict[str, int] = {}
    for stg in stages:
        order = stg.get("order_index", 0)
        for t in stg.get("tasks", []):
            task_key = t.get("key")
            if task_key:
                task_to_stage_order[task_key] = order

    for stg in stages:
        curr_order = stg.get("order_index", 0)
        for t in stg.get("tasks", []):
            for dep in t.get("depends_on", []):
                dep_stage_order = task_to_stage_order.get(dep)
                if dep_stage_order is not None and dep_stage_order > curr_order:
                    return False, "INVALID_DEPENDENCY"

    return True, None

validate_stage_order = validate_stage_dependencies
check_invalid_dependencies = validate_stage_dependencies
validate_workflow_graph = validate_stage_dependencies
