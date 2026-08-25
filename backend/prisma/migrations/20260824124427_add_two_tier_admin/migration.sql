-- AlterTable
ALTER TABLE "tenant_users" ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
