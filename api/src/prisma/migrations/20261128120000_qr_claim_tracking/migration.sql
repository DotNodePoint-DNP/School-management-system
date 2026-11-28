ALTER TABLE qr_claims ADD COLUMN tracking_number SERIAL NOT NULL;
CREATE UNIQUE INDEX qr_claims_tracking_number_key ON qr_claims(tracking_number);
