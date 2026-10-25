ALTER TABLE services ADD COLUMN allow_guest boolean NOT NULL DEFAULT true;
ALTER TABLE appointments ALTER COLUMN customer_id DROP NOT NULL,
  ADD COLUMN guest_name text, ADD COLUMN guest_phone text CHECK (guest_phone ~ '^\+[1-9][0-9]{7,14}$'), ADD COLUMN guest_email text,
  ADD CONSTRAINT who_booked CHECK (customer_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL));
CREATE UNIQUE INDEX appointments_guest_key_idx ON appointments(idempotency_key) WHERE customer_id IS NULL;
