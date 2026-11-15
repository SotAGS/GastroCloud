BEGIN;

ALTER TABLE company ADD COLUMN IF NOT EXISTS is_support_operator boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS support_account (
  user_id uuid PRIMARY KEY REFERENCES "user"(id),
  can_manage_support boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_activity (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_name varchar(120) NOT NULL,
  actor_type varchar(20) NOT NULL,
  method varchar(10) NOT NULL,
  path varchar(255) NOT NULL,
  action varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_activity_company_created_idx
  ON support_activity (company_id, created_at);

COMMIT;
