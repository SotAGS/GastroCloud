BEGIN;

DO $$
BEGIN
  CREATE TYPE enum_company_subscription_plan AS ENUM ('FREEMIUM', 'PREMIUM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS company (
  id uuid PRIMARY KEY,
  name varchar(150) NOT NULL,
  slug varchar(120) NOT NULL UNIQUE,
  subscription_plan enum_company_subscription_plan NOT NULL DEFAULT 'FREEMIUM',
  subscription_status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS "local" (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES company(id),
  name varchar(120) NOT NULL,
  address varchar(200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES company(id);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS local_id uuid REFERENCES "local"(id);

ALTER TABLE category ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE category ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE product ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE product ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE product ADD COLUMN IF NOT EXISTS sale_price numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE purchase ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE purchase ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE role ADD COLUMN IF NOT EXISTS company_id uuid;

WITH role_owners AS (
  SELECT r.id,
         MIN(u.company_id::text)::uuid AS company_id
  FROM role AS r
  JOIN "user" AS u ON u.role_id = r.id
  WHERE u.company_id IS NOT NULL
    AND r.name NOT IN ('ADMIN', 'EMPLEADO')
  GROUP BY r.id
  HAVING COUNT(DISTINCT u.company_id) = 1
)
UPDATE role AS r
SET company_id = owners.company_id
FROM role_owners AS owners
WHERE r.id = owners.id
  AND r.company_id IS NULL;

UPDATE purchase AS p
SET company_id = u.company_id,
    local_id = u.local_id
FROM "user" AS u
WHERE p.created_by_user_id = u.id
  AND p.company_id IS NULL
  AND u.company_id IS NOT NULL;

WITH supplier_owners AS (
  SELECT p.supplier_id,
         MIN(p.company_id::text)::uuid AS company_id
  FROM purchase AS p
  WHERE p.company_id IS NOT NULL
  GROUP BY p.supplier_id
  HAVING COUNT(DISTINCT p.company_id) = 1
)
UPDATE supplier AS s
SET company_id = owners.company_id
FROM supplier_owners AS owners
WHERE s.id = owners.supplier_id
  AND s.company_id IS NULL;

WITH product_owners AS (
  SELECT pd.product_id,
         MIN(p.company_id::text)::uuid AS company_id
  FROM purchase_detail AS pd
  JOIN purchase AS p ON p.id = pd.purchase_id
  WHERE p.company_id IS NOT NULL
  GROUP BY pd.product_id
  HAVING COUNT(DISTINCT p.company_id) = 1
)
UPDATE product AS p
SET company_id = owners.company_id
FROM product_owners AS owners
WHERE p.id = owners.product_id
  AND p.company_id IS NULL;

WITH category_owners AS (
  SELECT p.category_id,
         MIN(p.company_id::text)::uuid AS company_id
  FROM product AS p
  WHERE p.company_id IS NOT NULL
  GROUP BY p.category_id
  HAVING COUNT(DISTINCT p.company_id) = 1
)
UPDATE category AS c
SET company_id = owners.company_id
FROM category_owners AS owners
WHERE c.id = owners.category_id
  AND c.company_id IS NULL;

WITH stock_local_candidates AS (
  SELECT im.stock_id, u.local_id
  FROM inventory_movement AS im
  JOIN "user" AS u ON u.id = im.created_by_user_id
  WHERE u.local_id IS NOT NULL
  UNION
  SELECT s.id AS stock_id, p.local_id
  FROM stock AS s
  JOIN purchase_detail AS pd ON pd.product_id = s.product_id
  JOIN purchase AS p ON p.id = pd.purchase_id
  WHERE p.local_id IS NOT NULL
),
stock_local_owners AS (
  SELECT stock_id, MIN(local_id::text)::uuid AS local_id
  FROM stock_local_candidates
  GROUP BY stock_id
  HAVING COUNT(DISTINCT local_id) = 1
)
UPDATE stock AS s
SET local_id = owners.local_id
FROM stock_local_owners AS owners
WHERE s.id = owners.stock_id
  AND s.local_id IS NULL;

ALTER TABLE category DROP CONSTRAINT IF EXISTS category_name_normalized_key;
ALTER TABLE product DROP CONSTRAINT IF EXISTS product_sku_key;
ALTER TABLE product DROP CONSTRAINT IF EXISTS product_name_normalized_key;
ALTER TABLE supplier DROP CONSTRAINT IF EXISTS supplier_business_name_normalized_key;
ALTER TABLE supplier DROP CONSTRAINT IF EXISTS supplier_tax_id_key;
ALTER TABLE purchase DROP CONSTRAINT IF EXISTS purchase_purchase_number_key;
ALTER TABLE stock DROP CONSTRAINT IF EXISTS stock_product_id_key;
ALTER TABLE role DROP CONSTRAINT IF EXISTS role_name_key;

DROP INDEX IF EXISTS category_company_name_normalized_uq;
DROP INDEX IF EXISTS product_company_sku_uq;
DROP INDEX IF EXISTS product_company_name_normalized_uq;
CREATE UNIQUE INDEX IF NOT EXISTS category_local_name_normalized_uq
  ON category (local_id, name_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS product_local_sku_uq
  ON product (local_id, sku);
CREATE UNIQUE INDEX IF NOT EXISTS product_local_name_normalized_uq
  ON product (local_id, name_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_company_name_normalized_uq
  ON supplier (company_id, business_name_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_company_tax_id_uq
  ON supplier (company_id, tax_id);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_company_number_uq
  ON purchase (company_id, purchase_number);
CREATE UNIQUE INDEX IF NOT EXISTS stock_local_product_uq
  ON stock (local_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS role_global_name_uq
  ON role (name)
  WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS role_company_name_uq
  ON role (company_id, name)
  WHERE company_id IS NOT NULL;

DO $$
BEGIN
  CREATE TYPE enum_sale_status AS ENUM ('COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS sale (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES company(id),
  local_id uuid NOT NULL REFERENCES "local"(id),
  created_by_user_id uuid NOT NULL REFERENCES "user"(id),
  sale_number varchar(30) NOT NULL,
  status enum_sale_status NOT NULL DEFAULT 'COMPLETED',
  sold_at timestamptz NOT NULL DEFAULT now(),
  total numeric(14, 2) NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sale_company_number_uq
  ON sale (company_id, sale_number);

CREATE TABLE IF NOT EXISTS sale_detail (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  quantity numeric(14, 3) NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  line_total numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

WITH product_local_candidates AS (
  SELECT pd.product_id, p.local_id
  FROM purchase_detail AS pd
  JOIN purchase AS p ON p.id = pd.purchase_id
  WHERE p.local_id IS NOT NULL
  UNION
  SELECT sd.product_id, s.local_id
  FROM sale_detail AS sd
  JOIN sale AS s ON s.id = sd.sale_id
  WHERE s.local_id IS NOT NULL
  UNION
  SELECT st.product_id, st.local_id
  FROM stock AS st
  WHERE st.local_id IS NOT NULL
),
product_local_owners AS (
  SELECT product_id, MIN(local_id::text)::uuid AS local_id
  FROM product_local_candidates
  GROUP BY product_id
  HAVING COUNT(DISTINCT local_id) = 1
)
UPDATE product AS p
SET local_id = owners.local_id
FROM product_local_owners AS owners
WHERE p.id = owners.product_id
  AND p.local_id IS NULL;

WITH category_local_owners AS (
  SELECT category_id, MIN(local_id::text)::uuid AS local_id
  FROM product
  WHERE local_id IS NOT NULL
  GROUP BY category_id
  HAVING COUNT(DISTINCT local_id) = 1
)
UPDATE category AS c
SET local_id = owners.local_id
FROM category_local_owners AS owners
WHERE c.id = owners.category_id
  AND c.local_id IS NULL;

UPDATE product AS p
SET company_id = l.company_id
FROM "local" AS l
WHERE p.local_id = l.id
  AND p.company_id IS NULL;

UPDATE category AS c
SET company_id = l.company_id
FROM "local" AS l
WHERE c.local_id = l.id
  AND c.company_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_local_id_fkey') THEN
    ALTER TABLE product
      ADD CONSTRAINT product_local_id_fkey
      FOREIGN KEY (local_id) REFERENCES "local"(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_local_id_fkey') THEN
    ALTER TABLE category
      ADD CONSTRAINT category_local_id_fkey
      FOREIGN KEY (local_id) REFERENCES "local"(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END
$$;

INSERT INTO role (id, company_id, name, description, created_at, updated_at)
SELECT gen_random_uuid(), c.id, role_data.name, role_data.description, now(), now()
FROM company AS c
CROSS JOIN (VALUES
  ('GERENTE', 'Administra catálogo, usuarios y reportes de la empresa.'),
  ('CONTADOR', 'Consulta reportes de la empresa.')
) AS role_data(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM role AS r WHERE r.company_id = c.id AND r.name = role_data.name
);

INSERT INTO role_permission (id, role_id, module, action, created_at, updated_at)
SELECT gen_random_uuid(), r.id, permission_data.module, permission_data.action, now(), now()
FROM role AS r
CROSS JOIN LATERAL (
  SELECT 'dashboard' AS module, 'view' AS action WHERE r.name IN ('GERENTE', 'CONTADOR')
  UNION ALL SELECT 'reportes', 'view' WHERE r.name IN ('GERENTE', 'CONTADOR')
  UNION ALL SELECT 'catalog', 'read' WHERE r.name = 'GERENTE'
  UNION ALL SELECT 'catalog', 'manage-products' WHERE r.name = 'GERENTE'
  UNION ALL SELECT 'catalog', 'manage-categories' WHERE r.name = 'GERENTE'
  UNION ALL SELECT 'catalog', 'manage-suppliers' WHERE r.name = 'GERENTE'
  UNION ALL SELECT 'seguridad', 'view' WHERE r.name = 'GERENTE'
  UNION ALL SELECT 'seguridad', 'manage-users' WHERE r.name = 'GERENTE'
) AS permission_data
WHERE r.company_id IS NOT NULL
  AND r.name IN ('GERENTE', 'CONTADOR')
  AND NOT EXISTS (
    SELECT 1
    FROM role_permission AS rp
    WHERE rp.role_id = r.id
      AND rp.module = permission_data.module
      AND rp.action = permission_data.action
  );

COMMIT;
