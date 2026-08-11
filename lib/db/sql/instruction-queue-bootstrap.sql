CREATE TABLE IF NOT EXISTS instruction_fetch_queue (
  registry_product_id text PRIMARY KEY,
  registration_number text NOT NULL,
  trade_name text NOT NULL,
  inn text NOT NULL,
  dosage_form text NOT NULL,
  source_url text NOT NULL,
  source_product_json jsonb NOT NULL,
  priority_tier integer NOT NULL,
  priority_reason text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 3 NOT NULL,
  next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
  locked_at timestamp with time zone,
  locked_by text,
  registry_source_url text NOT NULL,
  source_snapshot_hash text NOT NULL,
  source_snapshot_checked_at timestamp with time zone NOT NULL,
  fetched_document_hash text,
  last_error_code text,
  last_checked_at timestamp with time zone,
  last_success_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS instruction_fetch_queue_ready_idx
  ON instruction_fetch_queue (status, next_attempt_at, priority_tier);
CREATE INDEX IF NOT EXISTS instruction_fetch_queue_registration_idx
  ON instruction_fetch_queue (registration_number);
CREATE INDEX IF NOT EXISTS instruction_fetch_queue_lock_idx
  ON instruction_fetch_queue (locked_at);

CREATE TABLE IF NOT EXISTS drug_instruction_documents (
  registry_product_id text PRIMARY KEY,
  registration_number text NOT NULL,
  trade_name text NOT NULL,
  status text NOT NULL,
  source_url text NOT NULL,
  document_hash text NOT NULL,
  document_date timestamp with time zone,
  checked_at timestamp with time zone NOT NULL,
  parser_version text NOT NULL,
  available_section_count integer NOT NULL,
  coverage_pct integer NOT NULL,
  source_snapshot_hash text NOT NULL,
  snapshot_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS drug_instruction_documents_registration_idx
  ON drug_instruction_documents (registration_number);
CREATE INDEX IF NOT EXISTS drug_instruction_documents_hash_idx
  ON drug_instruction_documents (document_hash);
CREATE INDEX IF NOT EXISTS drug_instruction_documents_status_idx
  ON drug_instruction_documents (status);
