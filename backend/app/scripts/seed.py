import hashlib
import psycopg
from neo4j import GraphDatabase
from backend.app.core.config import settings

def dummy_password_hash(password: str) -> str:
    # Deterministic hash for seed users
    return "sha256$" + hashlib.sha256(password.encode("utf-8")).hexdigest()

def seed_database(pg_url: str | None = None) -> dict:
    """Idempotently seeds PostgreSQL and Neo4j Aura with initial reference data."""
    if pg_url is None:
        pg_url = settings.DATABASE_SYNC_URL

    stats = {"departments": 0, "users": 0, "matter_types": 0, "templates": 0, "neo4j_nodes": 0}

    # 1. Seed PostgreSQL
    with psycopg.connect(pg_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            # Seed Departments
            depts = [
                ("Ban Sở hữu Trí tuệ", "DEPT_IP"),
                ("Ban Tranh chấp & Dân sự", "DEPT_CIVIL"),
                ("Ban Doanh nghiệp & Đầu tư", "DEPT_CORP")
            ]
            dept_ids = {}
            for name, code in depts:
                cur.execute("""
                    INSERT INTO departments (name, code)
                    VALUES (%s, %s)
                    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id;
                """, (name, code))
                row = cur.fetchone()
                dept_ids[code] = row[0]
                stats["departments"] += 1

            # Seed Users
            users_data = [
                ("nam.tran@asllaw.vn", "LS. Nam Trần", "Giám đốc điều hành", "MANAGER", True, None),
                ("anh.nguyen@asllaw.vn", "LS. Nguyễn Anh", "Trưởng ban SHTT", "MANAGER", False, dept_ids["DEPT_IP"]),
                ("trang.tran@asllaw.vn", "Trần Thị Thu Trang", "Kế toán trưởng", "ACCOUNTANT", False, None),
                ("huy.hoang@asllaw.vn", "LS. Hoàng Gia Huy", "Luật sư cấp cao", "ATTORNEY", False, dept_ids["DEPT_IP"]),
            ]
            user_ids = {}
            for email, full_name, title, role, is_exec, dept_id in users_data:
                cur.execute("""
                    INSERT INTO users (
                        email, password_hash, full_name, title, system_role, is_executive, department_id, is_active
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, true)
                    ON CONFLICT (email) DO UPDATE SET
                        full_name = EXCLUDED.full_name,
                        title = EXCLUDED.title,
                        system_role = EXCLUDED.system_role,
                        is_executive = EXCLUDED.is_executive,
                        department_id = EXCLUDED.department_id
                    RETURNING id;
                """, (email, dummy_password_hash("AslLaw@2026"), full_name, title, role, is_exec, dept_id))
                user_ids[email] = cur.fetchone()[0]
                stats["users"] += 1

            # Seed Department Leader (LS. Nguyễn Anh -> DEPT_IP)
            cur.execute("""
                INSERT INTO department_leaders (user_id, department_id)
                VALUES (%s, %s)
                ON CONFLICT (user_id, department_id) DO NOTHING;
            """, (user_ids["anh.nguyen@asllaw.vn"], dept_ids["DEPT_IP"]))

            # Seed Matter Types
            matter_types = [
                (dept_ids["DEPT_IP"], "Đăng ký Nhãn hiệu", "TM"),
                (dept_ids["DEPT_CORP"], "Tư vấn Hợp đồng & M&A", "MA")
            ]
            matter_ids = {}
            for did, m_name, m_code in matter_types:
                cur.execute("""
                    INSERT INTO matter_types (department_id, name, code)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id;
                """, (did, m_name, m_code))
                matter_ids[m_code] = cur.fetchone()[0]
                stats["matter_types"] += 1

            # Seed Workflow Templates
            templates = [
                (matter_ids["TM"], "Quy trình Đăng ký Nhãn hiệu Chuẩn", "STRICT"),
                (matter_ids["MA"], "Quy trình Tư vấn Hợp đồng Linh hoạt", "FLEXIBLE")
            ]
            for mid, t_name, mode in templates:
                cur.execute("""
                    INSERT INTO workflow_templates (matter_type_id, name, mode, is_active)
                    VALUES (%s, %s, %s, true)
                    ON CONFLICT DO NOTHING;
                """, (mid, t_name, mode))
                stats["templates"] += 1

    # 2. Sync to Neo4j Aura
    driver = GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
    )
    with driver.session() as s:
        # Sync Departments
        for name, code in depts:
            s.run("""
                MERGE (d:Department {code: $code})
                SET d.id = $id, d.name = $name
            """, code=code, id=str(dept_ids[code]), name=name)

        # Sync Users
        for email, full_name, title, role, is_exec, dept_id in users_data:
            s.run("""
                MERGE (u:User {email: $email})
                SET u.id = $id,
                    u.full_name = $name,
                    u.system_role = $role,
                    u.is_executive = $is_exec,
                    u.is_active = true
            """, email=email, id=str(user_ids[email]), name=full_name, role=role, is_exec=is_exec)

        # Sync Leader: LS. Nguyễn Anh -> DEPT_IP
        s.run("""
            MATCH (u:User {email: 'anh.nguyen@asllaw.vn'})
            MATCH (d:Department {code: 'DEPT_IP'})
            MERGE (u)-[:LEADS]->(d)
        """)

        # Sync Memberships
        s.run("""
            MATCH (u:User {email: 'huy.hoang@asllaw.vn'})
            MATCH (d:Department {code: 'DEPT_IP'})
            MERGE (u)-[:MEMBER_OF]->(d)
        """)
        s.run("""
            MATCH (u:User {email: 'anh.nguyen@asllaw.vn'})
            MATCH (d:Department {code: 'DEPT_IP'})
            MERGE (u)-[:MEMBER_OF]->(d)
        """)

    driver.close()
    return stats

if __name__ == "__main__":
    print("Running database seed...")
    result = seed_database()
    print("Seed completed successfully:", result)
