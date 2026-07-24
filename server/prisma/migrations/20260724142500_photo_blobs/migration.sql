-- CreateTable
CREATE TABLE "PhotoBlob" (
    "photoId" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoBlob_pkey" PRIMARY KEY ("photoId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Photo_filename_key" ON "Photo"("filename");

-- AddForeignKey
ALTER TABLE "PhotoBlob" ADD CONSTRAINT "PhotoBlob_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
