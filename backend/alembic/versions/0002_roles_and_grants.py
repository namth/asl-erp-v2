"""Roles and grants migration for asl_owner and asl_app

Revision ID: 0002_roles_and_grants
Revises: 0001_baseline
Create Date: 2026-11-11

"""
import os
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_roles_and_grants"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    owner_pw = os.environ.get("ASL_OWNER_PASSWORD")
    app_pw = os.environ.get("ASL_APP_PASSWORD")

    if not owner_pw:
        raise ValueError("ASL_OWNER_PASSWORD environment variable is required")
    if not app_pw:
        raise ValueError("ASL_APP_PASSWORD environment variable is required")

    escaped_owner_pw = owner_pw.replace("'", "''")
    escaped_app_pw = app_pw.replace("'", "''")

    conn = op.get_bind()

    # 1. Create or update roles with LOGIN NOSUPERUSER
    conn.exec_driver_sql(f"""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asl_owner') THEN
            CREATE ROLE asl_owner WITH LOGIN NOSUPERUSER PASSWORD '{escaped_owner_pw}';
        ELSE
            ALTER ROLE asl_owner WITH LOGIN NOSUPERUSER PASSWORD '{escaped_owner_pw}';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asl_app') THEN
            CREATE ROLE asl_app WITH LOGIN NOSUPERUSER PASSWORD '{escaped_app_pw}';
        ELSE
            ALTER ROLE asl_app WITH LOGIN NOSUPERUSER PASSWORD '{escaped_app_pw}';
        END IF;
    END $$;
    """)

    # 2. Add trigger for commission_transactions
    conn.exec_driver_sql("""
    CREATE OR REPLACE FUNCTION trg_commission_immutable()
    RETURNS TRIGGER AS $$
    BEGIN
        RAISE EXCEPTION 'commission_transactions cannot be deleted or modified. Only INSERT is allowed.';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_commission_no_modify ON commission_transactions;
    CREATE TRIGGER trg_commission_no_modify
        BEFORE UPDATE OR DELETE ON commission_transactions
        FOR EACH ROW
        EXECUTE FUNCTION trg_commission_immutable();
    """)

    # 3. Transfer ownership of all public objects to asl_owner (except alembic_version)
    conn.exec_driver_sql("""
    GRANT USAGE, CREATE ON SCHEMA public TO asl_owner;

    DO $$
    DECLARE
        r RECORD;
    BEGIN
        -- Transfer tables and partitions
        FOR r IN (
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tablename <> 'alembic_version'
        ) LOOP
            EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO asl_owner';
        END LOOP;

        -- Transfer sequences
        FOR r IN (
            SELECT sequencename FROM pg_sequences
            WHERE schemaname = 'public'
        ) LOOP
            EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequencename) || ' OWNER TO asl_owner';
        END LOOP;

        -- Transfer functions in public
        FOR r IN (
            SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
        ) LOOP
            EXECUTE 'ALTER FUNCTION public.' || quote_ident(r.proname) || '(' || r.args || ') OWNER TO asl_owner';
        END LOOP;
    END $$;
    """)

    # 4. Grants for asl_app
    conn.exec_driver_sql("""
    GRANT USAGE ON SCHEMA public TO asl_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO asl_app;

    DO $$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN (
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tablename <> 'alembic_version'
        ) LOOP
            EXECUTE 'REVOKE ALL ON TABLE public.' || quote_ident(r.tablename) || ' FROM asl_app';
            IF LEFT(r.tablename, 10) = 'audit_logs'
               OR r.tablename = 'misa_transactions'
               OR r.tablename = 'commission_transactions' THEN
                EXECUTE 'GRANT SELECT, INSERT ON TABLE public.' || quote_ident(r.tablename) || ' TO asl_app';
            ELSE
                EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.' || quote_ident(r.tablename) || ' TO asl_app';
            END IF;
        END LOOP;
    END $$;

    -- Alter default privileges for future tables/sequences created by asl_owner
    ALTER DEFAULT PRIVILEGES FOR ROLE asl_owner IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO asl_app;

    ALTER DEFAULT PRIVILEGES FOR ROLE asl_owner IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO asl_app;
    """)


def downgrade() -> None:
    conn = op.get_bind()

    # 1. Drop trigger and function for commission_transactions
    conn.exec_driver_sql("""
    DROP TRIGGER IF EXISTS trg_commission_no_modify ON commission_transactions;
    DROP FUNCTION IF EXISTS trg_commission_immutable();
    """)

    # 2. Revoke default privileges and permissions from asl_app
    conn.exec_driver_sql("""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asl_owner') THEN
            ALTER DEFAULT PRIVILEGES FOR ROLE asl_owner IN SCHEMA public REVOKE ALL ON TABLES FROM asl_app;
            ALTER DEFAULT PRIVILEGES FOR ROLE asl_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM asl_app;
        END IF;
    END $$;

    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asl_app') THEN
            REVOKE ALL ON SCHEMA public FROM asl_app;
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM asl_app;
            REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM asl_app;
            REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM asl_app;
        END IF;
    END $$;
    """)

    # 3. Transfer ownership back to migration user
    conn.exec_driver_sql("""
    DO $$
    DECLARE
        r RECORD;
        cur_user text;
    BEGIN
        cur_user := session_user;

        FOR r IN (
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tablename <> 'alembic_version'
        ) LOOP
            EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO ' || quote_ident(cur_user);
        END LOOP;

        FOR r IN (
            SELECT sequencename FROM pg_sequences
            WHERE schemaname = 'public'
        ) LOOP
            EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequencename) || ' OWNER TO ' || quote_ident(cur_user);
        END LOOP;

        FOR r IN (
            SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
        ) LOOP
            EXECUTE 'ALTER FUNCTION public.' || quote_ident(r.proname) || '(' || r.args || ') OWNER TO ' || quote_ident(cur_user);
        END LOOP;
    END $$;

    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asl_owner') THEN
            REVOKE ALL ON SCHEMA public FROM asl_owner;
        END IF;
    END $$;
    """)

    # 4. Clean up roles
    conn.exec_driver_sql("""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asl_owner') THEN
            EXECUTE 'REASSIGN OWNED BY asl_owner TO CURRENT_USER';
            EXECUTE 'DROP OWNED BY asl_owner';
            DROP ROLE asl_owner;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asl_app') THEN
            EXECUTE 'REASSIGN OWNED BY asl_app TO CURRENT_USER';
            EXECUTE 'DROP OWNED BY asl_app';
            DROP ROLE asl_app;
        END IF;
    END $$;
    """)
