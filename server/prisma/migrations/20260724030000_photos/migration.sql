-- CreateTable
CREATE TABLE "Photo" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "coord" TEXT NOT NULL DEFAULT '',
    "cond" TEXT NOT NULL DEFAULT '',
    "whenShot" TEXT NOT NULL DEFAULT '',
    "aspectRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "toneA" TEXT NOT NULL DEFAULT '#12333a',
    "toneB" TEXT NOT NULL DEFAULT '#2a5a55',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "forSale" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);
