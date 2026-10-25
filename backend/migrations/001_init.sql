CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, password_hash text NOT NULL, name text NOT NULL,
  role text NOT NULL CHECK(role IN('customer','provider','admin')), language text DEFAULT 'en', created_at timestamptz DEFAULT now());
CREATE TABLE service_categories(id serial PRIMARY KEY, parent_id int REFERENCES service_categories(id), name text NOT NULL, slug text UNIQUE NOT NULL, active boolean DEFAULT true);
CREATE TABLE providers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL, city text, address text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata', verified boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE services(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES providers(id), category_id int REFERENCES service_categories(id),
  name text NOT NULL, duration_min int NOT NULL CHECK(duration_min>0), buffer_min int NOT NULL DEFAULT 0 CHECK(buffer_min>=0), price_cents int NOT NULL CHECK(price_cents>=0),
  cancel_hours_before int NOT NULL DEFAULT 24, active boolean DEFAULT true);
CREATE TABLE staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES providers(id), name text NOT NULL, active boolean DEFAULT true);
CREATE TABLE staff_services(staff_id uuid REFERENCES staff(id) ON DELETE CASCADE, service_id uuid REFERENCES services(id) ON DELETE CASCADE, PRIMARY KEY(staff_id,service_id));
CREATE TABLE availability_rules(id serial PRIMARY KEY, staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE, weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  start_time time NOT NULL, end_time time NOT NULL CHECK(end_time>start_time));
CREATE TABLE appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text UNIQUE NOT NULL, customer_id uuid NOT NULL REFERENCES users(id),
  provider_id uuid NOT NULL REFERENCES providers(id), service_id uuid NOT NULL REFERENCES services(id), staff_id uuid NOT NULL REFERENCES staff(id),
  during tstzrange NOT NULL, status text NOT NULL DEFAULT 'confirmed' CHECK(status IN('pending','confirmed','cancelled','completed','no_show')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN('unpaid','paid','refunded')), price_cents int NOT NULL,
  idempotency_key text, created_at timestamptz DEFAULT now(), UNIQUE(customer_id,idempotency_key),
  EXCLUDE USING gist (staff_id WITH =, during WITH &&) WHERE (status IN('pending','confirmed')));
CREATE INDEX ON appointments(customer_id); CREATE INDEX ON appointments(provider_id);
CREATE TABLE appointment_status_history(id serial PRIMARY KEY, appointment_id uuid REFERENCES appointments(id), status text, changed_by uuid, at timestamptz DEFAULT now());
CREATE TABLE audit_logs(id serial PRIMARY KEY, actor_id uuid, action text, entity text, entity_id text, at timestamptz DEFAULT now());
