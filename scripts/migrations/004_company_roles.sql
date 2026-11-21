BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
LOCK TABLE company, role, role_permission, "user" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS gastrocloud_schema_migration (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM gastrocloud_schema_migration WHERE name = '004_company_roles') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'role' AND column_name = 'company_wide_access'
  ) THEN
    ALTER TABLE role ADD COLUMN company_wide_access boolean NOT NULL DEFAULT false;
    UPDATE role SET company_wide_access = true WHERE name IN ('GERENTE', 'CONTADOR');
  END IF;

  IF (SELECT count(*) FROM role WHERE name = 'EMPLEADO' AND company_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Se necesita exactamente un rol EMPLEADO global para migrar.';
  END IF;

  IF EXISTS (SELECT 1 FROM role WHERE name = 'ADMIN' AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay roles ADMIN propios de empresas; revísalos antes de migrar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "user" AS u
    JOIN role AS r ON r.id = u.role_id
    LEFT JOIN company AS c ON c.id = u.company_id
    WHERE r.name = 'EMPLEADO' AND r.company_id IS NULL AND c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay usuarios EMPLEADO sin empresa válida; revísalos antes de migrar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "user" AS u
    JOIN role AS global_role ON global_role.id = u.role_id
    JOIN company AS c ON c.id = u.company_id
    JOIN role AS local_role ON local_role.company_id = c.id AND local_role.name = 'EMPLEADO'
    WHERE global_role.name = 'EMPLEADO' AND global_role.company_id IS NULL
      AND c.is_support_operator = false
  ) THEN
    RAISE EXCEPTION 'Una empresa tiene un rol EMPLEADO propio y usuarios con el rol global; revisa el conflicto antes de migrar.';
  END IF;

  WITH global_employee AS (
    SELECT id, description FROM role WHERE name = 'EMPLEADO' AND company_id IS NULL
  ),
  created_roles AS (
    INSERT INTO role (id, company_id, name, description, company_wide_access, created_at, updated_at)
    SELECT gen_random_uuid(), c.id, 'EMPLEADO', global_employee.description, false, now(), now()
    FROM company AS c CROSS JOIN global_employee
    WHERE c.is_support_operator = false
      AND NOT EXISTS (SELECT 1 FROM role AS r WHERE r.company_id = c.id AND r.name = 'EMPLEADO')
    RETURNING id
  )
  INSERT INTO role_permission (id, role_id, module, action, created_at, updated_at)
  SELECT gen_random_uuid(), created_roles.id, p.module, p.action, now(), now()
  FROM created_roles CROSS JOIN global_employee
  JOIN role_permission AS p ON p.role_id = global_employee.id;

  UPDATE "user" AS u
  SET role_id = local_role.id, updated_at = now()
  FROM role AS global_role, role AS local_role, company AS c
  WHERE global_role.id = u.role_id
    AND global_role.name = 'EMPLEADO' AND global_role.company_id IS NULL
    AND c.id = u.company_id AND c.is_support_operator = false
    AND local_role.company_id = c.id AND local_role.name = 'EMPLEADO';

  INSERT INTO gastrocloud_schema_migration (name) VALUES ('004_company_roles');
END
$$;

COMMIT;
