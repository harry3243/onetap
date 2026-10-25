ALTER TABLE users ADD COLUMN phone text CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'), ADD COLUMN notify_channels text[] NOT NULL DEFAULT '{email}', ADD COLUMN location_consent boolean NOT NULL DEFAULT false;
ALTER TABLE providers ADD COLUMN lat double precision, ADD COLUMN lng double precision;
ALTER TABLE appointments ADD COLUMN arrived_at timestamptz, ADD COLUMN cancel_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex');
CREATE UNIQUE INDEX appointments_cancel_token_idx ON appointments(cancel_token);
CREATE TABLE notifications(id serial PRIMARY KEY, appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE, kind text NOT NULL,
  scheduled_for timestamptz NOT NULL, sent_at timestamptz, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sent','failed','skipped')), result text, UNIQUE(appointment_id,kind));
CREATE INDEX ON notifications(scheduled_for) WHERE status='pending';
