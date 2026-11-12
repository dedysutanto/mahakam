-- Buyer NPWP/NIK snapshot on invoices, mirroring the other customer* snapshot
-- columns. Coretax XML export needs the buyer tax id as it was when the invoice
-- was issued; reading it live from Customer would rewrite already-reported
-- e-faktur history whenever a customer record is edited.
ALTER TABLE "invoices" ADD COLUMN "customerTaxId" VARCHAR(50);

-- Backfill from the current customer record; invoices issued before this column
-- existed have no other source for it.
UPDATE "invoices" i
SET "customerTaxId" = c."taxId"
FROM "customers" c
WHERE i."customerId" = c."id" AND c."taxId" IS NOT NULL;
