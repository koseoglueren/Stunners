-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LEADER', 'OFFICER', 'MEMBER');

-- CreateEnum
CREATE TYPE "CharClass" AS ENUM ('WARRIOR', 'ROGUE', 'MAGE', 'PRIEST', 'KURIAN');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "LootCategory" AS ENUM ('COIN', 'SCROLL', 'WEAPON', 'ARMOR', 'MATERIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LootStatus" AS ENUM ('COIN', 'IN_STOCK', 'SOLD', 'GIVEN');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'LOCKED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'SENT', 'RECEIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "charClass" "CharClass",
    "level" INTEGER,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FarmLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmSession" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "locationId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionMember" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SessionMember_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "ItemCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LootCategory" NOT NULL,
    "defaultPrice" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ItemCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LootEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "category" "LootCategory" NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "plusLevel" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "holderId" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    "status" "LootStatus" NOT NULL,
    "salePrice" BIGINT,
    "soldById" TEXT,
    "soldAt" TIMESTAMP(3),
    "receiverId" TEXT,
    "note" TEXT,
    "droppedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LootEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "total" BIGINT NOT NULL DEFAULT 0,
    "perShare" BIGINT NOT NULL DEFAULT 0,
    "remainder" BIGINT NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementSession" (
    "settlementId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "SettlementSession_pkey" PRIMARY KEY ("settlementId","sessionId")
);

-- CreateTable
CREATE TABLE "SettlementShare" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "share" BIGINT NOT NULL,
    "held" BIGINT NOT NULL,
    "balance" BIGINT NOT NULL,

    CONSTRAINT "SettlementShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "FarmLocation_name_key" ON "FarmLocation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCatalog_name_key" ON "ItemCatalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementShare_settlementId_userId_key" ON "SettlementShare"("settlementId", "userId");

-- AddForeignKey
ALTER TABLE "FarmSession" ADD CONSTRAINT "FarmSession_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "FarmLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmSession" ADD CONSTRAINT "FarmSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMember" ADD CONSTRAINT "SessionMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FarmSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMember" ADD CONSTRAINT "SessionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FarmSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementSession" ADD CONSTRAINT "SettlementSession_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementSession" ADD CONSTRAINT "SettlementSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FarmSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementShare" ADD CONSTRAINT "SettlementShare_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementShare" ADD CONSTRAINT "SettlementShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
