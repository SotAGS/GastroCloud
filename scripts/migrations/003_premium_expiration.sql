BEGIN;

ALTER TABLE company ADD COLUMN IF NOT EXISTS premium_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS payment_attempt (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES company(id),
  created_by_user_id uuid NOT NULL,
  preference_id varchar(120) NOT NULL,
  collector_id varchar(30) NOT NULL,
  checkout_url varchar(500) NOT NULL,
  provider_payment_id varchar(30) UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_attempt_company_created_idx
  ON payment_attempt (company_id, created_at);

COMMIT;
