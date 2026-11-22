-- AlterTable
ALTER TABLE "LootEntry" ADD COLUMN     "customOwners" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SessionMember" ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "leftAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LootOwner" (
    "lootId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "LootOwner_pkey" PRIMARY KEY ("lootId","userId")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "LootOwner" ADD CONSTRAINT "LootOwner_lootId_fkey" FOREIGN KEY ("lootId") REFERENCES "LootEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootOwner" ADD CONSTRAINT "LootOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
