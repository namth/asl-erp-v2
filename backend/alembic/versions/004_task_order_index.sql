-- 004_task_order_index.sql: thứ tự hiển thị task trong stage (template và vụ việc). Chạy lặp được.
-- created_at không dùng làm thứ tự được: mọi task lưu trong cùng một transaction có cùng now().
ALTER TABLE template_tasks ADD COLUMN IF NOT EXISTS order_index SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS order_index SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_template_tasks_stage_order ON template_tasks(template_stage_id, order_index);
CREATE INDEX IF NOT EXISTS idx_case_tasks_stage_order ON case_tasks(stage_id, order_index);
