-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "legacySlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Photo_legacySlug_key" ON "Photo"("legacySlug");

-- CreateTable
CREATE TABLE "LegacyRedirectHit" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT NOT NULL DEFAULT '',
    "matched" TEXT NOT NULL,
    "resolvedTo" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyRedirectHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyRedirectHit_createdAt_idx" ON "LegacyRedirectHit"("createdAt");

-- CreateIndex
CREATE INDEX "LegacyRedirectHit_path_idx" ON "LegacyRedirectHit"("path");
