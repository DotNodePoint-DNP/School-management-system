ALTER TABLE document_templates DROP CONSTRAINT document_templates_kind_check;
ALTER TABLE document_templates ADD CONSTRAINT document_templates_kind_check CHECK (kind IN ('ID_CARD', 'CERTIFICATE', 'OFFICIAL_LETTER'));
ALTER TABLE document_issues ALTER COLUMN enrollment_id DROP NOT NULL;
