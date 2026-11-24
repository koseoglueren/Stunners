"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { done, fail, str } from "@/lib/forms";
import { noah, parseNoah } from "@/lib/format";
import { planGroupSale, vaultKey } from "@/lib/vault-sale";

export async function setTreasurer(form: FormData) {
  const me = await requireRole("OFFICER");
  const userId = str(form, "userId");
  const u = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!u) fail("/vault", "Kasa hesabı için bir üye seç.");
  await prisma.setting.upsert({ where: { key: "treasurerId" }, create: { key: "treasurerId", value: u.id }, update: { value: u.id } });
  await audit(me.id, "treasurer_set", u.characterName);
  revalidatePath("/vault");
  done("/vault", `Clan kasası artık ${u.characterName} hesabında.`);
}

/**
 * Grouped vault sale: "13 of the 20 Mirage Daggers sold for 45000".
 * Units come out of the oldest records first. A record sold only in part is split:
 * the sold units become their own SOLD record (same farm, same owners) and the rest stays in the vault.
 */
export async function sellVaultGroup(form: FormData) {
  const me = await requireRole("OFFICER");
  const key = str(form, "key");
  const qty = Number(str(form, "qty"));
  const price = parseNoah(str(form, "salePrice"));
  if (!price || price <= 0n) fail("/vault", "Satış fiyatını gir (örn. 45000).");
  const soldById = str(form, "soldById") || me.id;

  const rows = (
    await prisma.lootEntry.findMany({
      where: { status: "IN_STOCK", inVault: true, settlementId: null },
      include: { owners: true },
      orderBy: [{ droppedAt: "asc" }, { createdAt: "asc" }],
    })
  ).filter((l) => vaultKey(l) === key);
  if (rows.length === 0) fail("/vault", "Bu item kasada bulunamadı.");

  let parts: ReturnType<typeof planGroupSale>;
  try {
    parts = planGroupSale(rows, qty, price);
  } catch (e) {
    fail("/vault", (e as Error).message);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const now = new Date();
  await prisma.$transaction(
    parts.flatMap((p) => {
      const r = byId.get(p.id)!;
      const sold = { status: "SOLD" as const, salePrice: p.price, soldById, soldAt: now, receiverId: null };
      if (p.left === 0) return [prisma.lootEntry.update({ where: { id: r.id }, data: sold })];
      return [
        prisma.lootEntry.update({ where: { id: r.id }, data: { quantity: p.left, value: r.value - p.soldValue } }),
        prisma.lootEntry.create({
          data: {
            ...sold,
            sessionId: r.sessionId,
            inVault: true,
            vaultAt: r.vaultAt,
            category: r.category,
            itemId: r.itemId,
            itemName: r.itemName,
            plusLevel: r.plusLevel,
            quantity: p.sold,
            holderId: r.holderId,
            value: p.soldValue,
            note: r.note,
            droppedAt: r.droppedAt,
            handedOverById: r.handedOverById,
            customOwners: r.customOwners,
            owners: r.customOwners ? { create: r.owners.map((o) => ({ userId: o.userId })) } : undefined,
          },
        }),
      ];
    }),
  );
  const label = `${rows[0].itemName}${rows[0].plusLevel !== null ? ` +${rows[0].plusLevel}` : ""}`;
  const left = rows.reduce((a, r) => a + r.quantity, 0) - qty;
  await audit(me.id, "vault_group_sold", `${label} ${qty} adet ${price}`);
  revalidatePath("/vault");
  for (const sid of new Set(rows.map((r) => r.sessionId).filter(Boolean))) revalidatePath(`/farms/${sid}`);
  done("/vault", `${label}: ${qty} adet ${noah(price)} Noah'a satıldı. Kasada ${left} adet kaldı.`);
}
