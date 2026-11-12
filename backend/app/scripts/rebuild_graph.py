import sys
import argparse
import psycopg
from neo4j import GraphDatabase

from backend.app.core.config import settings

def rebuild_graph(dry_run: bool = False) -> dict:
    """Rebuilds the entire Neo4j graph (User, Department, Case, and relationships) from PostgreSQL."""
    # 1. Fetch source of truth from PostgreSQL
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            # Users
            cur.execute("""
                SELECT id, email, full_name, system_role, is_executive, is_active, department_id
                FROM users
            """)
            raw_users = cur.fetchall()
            users = [{
                "id": str(r[0]),
                "email": r[1],
                "full_name": r[2] or "",
                "system_role": r[3],
                "is_executive": bool(r[4]),
                "is_active": bool(r[5]),
                "department_id": str(r[6]) if r[6] else None
            } for r in raw_users]

            # Departments
            cur.execute("SELECT id, code, name FROM departments")
            raw_depts = cur.fetchall()
            depts = [{
                "id": str(r[0]),
                "code": r[1],
                "name": r[2] or ""
            } for r in raw_depts]

            # Cases
            cur.execute("SELECT id, case_code, status, department_id FROM cases")
            raw_cases = cur.fetchall()
            cases = [{
                "id": str(r[0]),
                "case_code": r[1],
                "status": r[2] or "ACTIVE",
                "department_id": str(r[3]) if r[3] else None
            } for r in raw_cases]

            # Department Leaders
            cur.execute("SELECT user_id, department_id FROM department_leaders")
            leaders = [{
                "user_id": str(r[0]),
                "department_id": str(r[1])
            } for r in cur.fetchall()]

            # Memberships
            members = [{
                "user_id": u["id"],
                "department_id": u["department_id"]
            } for u in users if u["department_id"]]

            # Case Assignments
            cur.execute("""
                SELECT user_id, case_id, role_in_case
                FROM case_assignments
                WHERE unassigned_at IS NULL
            """)
            assignments = [{
                "user_id": str(r[0]),
                "case_id": str(r[1]),
                "role": r[2]
            } for r in cur.fetchall()]

    stats = {
        "users": len(users),
        "departments": len(depts),
        "cases": len(cases),
        "leaders": len(leaders),
        "members": len(members),
        "assignments": len(assignments)
    }

    if dry_run:
        print("[DRY-RUN] Rebuild Graph Summary:")
        print(f"  - User nodes (nút người dùng): {stats['users']}")
        print(f"  - Department nodes (nút phòng ban): {stats['departments']}")
        print(f"  - Case nodes (nút vụ việc): {stats['cases']}")
        print(f"  - :LEADS edges (cạnh lãnh đạo): {stats['leaders']}")
        print(f"  - :MEMBER_OF edges (cạnh thành viên): {stats['members']}")
        print(f"  - :ASSIGNED_TO edges (cạnh phân công): {stats['assignments']}")
        return stats

    # 2. Apply full rebuild to Neo4j Aura in a single atomic write transaction
    driver = GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
    )

    with driver.session() as s:
        def _do_rebuild(tx):
            # A. Clean up all existing User, Department, Case nodes and edges
            tx.run("MATCH (u:User) DETACH DELETE u")
            tx.run("MATCH (d:Department) DETACH DELETE d")
            tx.run("MATCH (c:Case) DETACH DELETE c")

            tx.run("MATCH ()-[r:LEADS]->() DELETE r")
            tx.run("MATCH ()-[r:MEMBER_OF]->() DELETE r")
            tx.run("MATCH ()-[r:ASSIGNED_TO]->() DELETE r")

            # B. Recreate Department nodes
            if depts:
                tx.run("""
                    UNWIND $depts AS d
                    CREATE (dept:Department {id: d.id, code: d.code, name: d.name})
                """, depts=depts)

            # C. Recreate User nodes
            if users:
                tx.run("""
                    UNWIND $users AS u
                    CREATE (user:User {
                        id: u.id,
                        email: u.email,
                        full_name: u.full_name,
                        system_role: u.system_role,
                        is_executive: u.is_executive,
                        is_active: u.is_active
                    })
                """, users=users)

            # D. Recreate Case nodes and :IN_DEPARTMENT
            if cases:
                tx.run("""
                    UNWIND $cases AS c
                    CREATE (case_node:Case {
                        id: c.id,
                        case_code: c.case_code,
                        status: c.status
                    })
                    WITH case_node, c
                    WHERE c.department_id IS NOT NULL
                    MATCH (d:Department {id: c.department_id})
                    CREATE (case_node)-[:IN_DEPARTMENT]->(d)
                """, cases=cases)

            # E. Recreate :MEMBER_OF edges
            if members:
                tx.run("""
                    UNWIND $members AS m
                    MATCH (u:User {id: m.user_id})
                    MATCH (d:Department {id: m.department_id})
                    CREATE (u)-[:MEMBER_OF]->(d)
                """, members=members)

            # F. Recreate :LEADS edges
            if leaders:
                tx.run("""
                    UNWIND $leaders AS l
                    MATCH (u:User {id: l.user_id})
                    MATCH (d:Department {id: l.department_id})
                    CREATE (u)-[:LEADS]->(d)
                """, leaders=leaders)

            # G. Recreate :ASSIGNED_TO edges
            if assignments:
                tx.run("""
                    UNWIND $assignments AS a
                    MATCH (u:User {id: a.user_id})
                    MATCH (c:Case {id: a.case_id})
                    CREATE (u)-[:ASSIGNED_TO {role: a.role}]->(c)
                """, assignments=assignments)

        s.execute_write(_do_rebuild)

    driver.close()
    print("Rebuild graph completed successfully:")
    print(f"  Users: {stats['users']}, Departments: {stats['departments']}, Cases: {stats['cases']}")
    print(f"  LEADS: {stats['leaders']}, MEMBER_OF: {stats['members']}, ASSIGNED_TO: {stats['assignments']}")
    return stats

def main():
    parser = argparse.ArgumentParser(description="Rebuild Neo4j graph from PostgreSQL source of truth.")
    parser.add_argument("--dry-run", action="store_true", help="Print expected nodes and edges count without modifying Neo4j.")
    args = parser.parse_args()

    rebuild_graph(dry_run=args.dry_run)

if __name__ == "__main__":
    main()
