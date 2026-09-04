-- Backfill: re-date payment journal entries to the invoice's issue date (accrual).
-- Dashboard/Laba Rugi group revenue by journal entry date; payments posted with
-- date = payment day (cash basis) misattributed August invoices paid in September.
-- referenceId on a 'payment' JE is the payment.id (not the invoice id), so the
-- join goes through the payments table. Prisma columns are camelCase + quoted.
UPDATE "journal_entries" je
SET "date" = i."issueDate"
FROM "payments" p
JOIN "invoices" i ON i."id" = p."invoiceId"
WHERE je."referenceType" = 'payment'
  AND je."referenceId" = p."id"
  AND je."isReversed" = false
  AND je."date" <> i."issueDate";