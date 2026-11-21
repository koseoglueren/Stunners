-- CreateEnum
CREATE TYPE "SettlementMode" AS ENUM ('COLLECTOR', 'DIRECT');

-- CreateEnum
CREATE TYPE "TransferKind" AS ENUM ('DELIVERY', 'PAYOUT', 'DIRECT');

-- AlterTable
ALTER TABLE "LootEntry" ADD COLUMN     "handedOverById" TEXT,
ADD COLUMN     "handoverSettlementId" TEXT;

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "collectorId" TEXT,
ADD COLUMN     "mode" "SettlementMode" NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "SettlementShare" ADD COLUMN     "kept" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "kind" "TransferKind" NOT NULL DEFAULT 'DIRECT';

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_handoverSettlementId_fkey" FOREIGN KEY ("handoverSettlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_handedOverById_fkey" FOREIGN KEY ("handedOverById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
