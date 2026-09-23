-- =============================================================================
-- Nigerian residency by default (NFR-5).
--
-- The column has defaulted to 'us-east-1' since the baseline, which is a
-- default inherited from the scaffolding rather than chosen. It is the wrong
-- one for this product twice over: the requirement is that records stay in
-- Nigeria unless somebody asks otherwise in writing, and the residency clause
-- in the contract says so. A tenancy created without anybody thinking about it
-- should land where the contract promises, not in Virginia.
--
-- Existing rows are moved with it. Every one of them was created by the
-- default rather than by a decision — there is no customer who asked for
-- us-east-1, because nothing has ever offered it as a choice. A tenancy that
-- had genuinely chosen an offshore region would be left alone, and this
-- migration would have to be narrower.
-- =============================================================================

ALTER TABLE public.organizations
    ALTER COLUMN region SET DEFAULT 'ng-lagos-1'::text;

UPDATE public.organizations
   SET region = 'ng-lagos-1'
 WHERE region = 'us-east-1';

COMMENT ON COLUMN public.organizations.region IS
  'Where this tenancy''s records, backups and indexes live. Fixed at the first '
  'record: not changeable by the customer, by support, or by us. Lagos unless '
  'an offshore region was requested in writing with the residency clause '
  'struck out (NFR-5).';
