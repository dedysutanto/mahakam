-- Backfill: re-date payment journal entries to the invoice's issue date (accrual).
-- Dashboard/Laba Rugi group revenue by journal entry date; payments posted with
-- date = payment day (cash basis) misattributed August invoices paid in September.
-- Only payment JEs (referenceType = 'payment') get re-dated; isReversed rows keep
-- their own date (reversals stay in the reversal period).
-- NOTE: Prisma created camelCase, double-quoted columns — "referenceType",
-- "isReversed", "issueDate" — not snake_case.
UPDATE "journal_entries" je
SET "date" = i."issueDate"
FROM "invoices" i
WHERE je."referenceType" = 'payment'
  AND je."referenceId" IS NOT NULL
  AND je."isReversed" = false
  AND je."referenceId" = i."id"
  AND je."date" <> i."issueDate";