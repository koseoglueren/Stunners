"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTreasurer } from "@/lib/clan";
import { computeSettlement, lootContribution } from "@/lib/settlement";
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

/**
 * Pooled distribution of sold vault items: the money of the selected sales is added up
 * and split equally among the selected members. Recorded as a locked day-end settlement
 * (without farms, so the farms stay editable); the vault account pays each member.
 */
export async function distributeSales(form: FormData) {
  const me = await requireRole("OFFICER");
  const saleIds = [...new Set(form.getAll("sel").map(String).filter(Boolean))];
  const memberIds = [...new Set(form.getAll("memberIds").map(String).filter(Boolean))];
  if (saleIds.length === 0) fail("/vault", "Dağıtılacak en az bir satış seç.");
  if (memberIds.length === 0) fail("/vault", "Dağıtılacak en az bir kişi seç.");
  const treasurer = await getTreasurer();
  const collectorId = treasurer?.id ?? me.id;

  const sales = await prisma.lootEntry.findMany({ where: { id: { in: saleIds }, status: "SOLD", settlementId: null } });
  if (sales.length !== saleIds.length) fail("/vault", "Seçilen satışlardan biri zaten dağıtılmış ya da satılmamış; sayfayı yenile.");
  const members = await prisma.user.count({ where: { id: { in: memberIds } } });
  if (members !== memberIds.length) fail("/vault", "Seçilen üyelerden biri bulunamadı.");

  const beneficiaries = memberIds.map((userId) => ({ userId, weight: 1n }));
  const p = computeSettlement(
    sales.map((l) => ({ ...lootContribution(l)!, beneficiaries })),
    collectorId,
  );
  const title = `Satış dağıtımı ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`;
  const st = await prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: {
        title,
        status: "LOCKED",
        mode: "COLLECTOR",
        collectorId,
        total: p.total,
        perShare: p.perShare,
        remainder: p.remainder,
        createdById: me.id,
        lockedAt: new Date(),
        shares: { create: p.shares.map((s) => ({ userId: s.userId, share: s.share, held: s.held, kept: s.kept, balance: s.balance })) },
        transfers: { create: p.transfers.map((t) => ({ fromId: t.fromId, toId: t.toId, amount: t.amount, kind: t.kind })) },
      },
    });
    const n = await tx.lootEntry.updateMany({ where: { id: { in: saleIds }, settlementId: null }, data: { settlementId: settlement.id } });
    if (n.count !== saleIds.length) throw new Error("Satışlar başka bir hesapta dağıtıldı, sayfayı yenile.");
    return settlement;
  });
  await audit(me.id, "sales_distributed", `${title}: ${p.total} / ${memberIds.length} kişi`);
  revalidatePath("/vault");
  revalidatePath("/settlements");
  revalidatePath("/payim");
  redirect(`/settlements/${st.id}`);
}
