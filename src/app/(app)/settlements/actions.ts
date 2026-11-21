"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { fail, done, str } from "@/lib/forms";
import { buildSettlementPreview } from "@/lib/settlement-data";

export async function createSettlement(form: FormData) {
  const me = await requireRole("OFFICER");
  const ids = form.getAll("sessionIds").map(String).filter(Boolean);
  const mode = str(form, "mode") === "DIRECT" ? "DIRECT" : "COLLECTOR";
  const collectorId = mode === "COLLECTOR" ? str(form, "collectorId") : "";
  const handover = mode === "COLLECTOR" && form.get("handover") === "1";
  const back = `/settlements/new?${ids.map((i) => `oturum=${i}`).join("&")}`;
  if (ids.length === 0) fail("/settlements/new", "En az bir farm seç.");
  if (mode === "COLLECTOR" && !collectorId) fail(back, "Farmı teslim alacak üyeyi (dağıtıcı) seç.");
  const p = await buildSettlementPreview(ids, collectorId || null);
  if (mode === "COLLECTOR" && !p.collector) fail(back, "Dağıtıcı üye bulunamadı.");
  if (p.active.length) fail(back, "Devam eden farm var; önce farmı bitir.");
  if (p.included.length === 0 && !(handover && p.unsold.length)) fail(back, "Hesaplanacak coin veya satılmış item yok.");
  const title = str(form, "title") || `Gün sonu ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`;

  const settlement = await prisma.$transaction(async (tx) => {
    // guard against a parallel lock of the same loot
    const lootIds = p.included.map((i) => i.loot.id);
    const stillFree = await tx.lootEntry.count({ where: { id: { in: lootIds }, settlementId: null } });
    if (stillFree !== lootIds.length) throw new Error("Loot başka bir hesapta kilitlendi, sayfayı yenile.");
    const st = await tx.settlement.create({
      data: {
        title,
        status: "LOCKED",
        mode,
        collectorId: collectorId || null,
        total: p.total,
        perShare: p.perShare,
        remainder: p.remainder,
        createdById: me.id,
        lockedAt: new Date(),
        sessions: { create: ids.map((sessionId) => ({ sessionId })) },
        shares: { create: p.shares.map((s) => ({ userId: s.userId, share: s.share, held: s.held, kept: s.kept, balance: s.balance })) },
        transfers: { create: p.transfers.map((t) => ({ fromId: t.fromId, toId: t.toId, amount: t.amount, kind: t.kind })) },
      },
    });
    await tx.lootEntry.updateMany({ where: { id: { in: lootIds } }, data: { settlementId: st.id } });
    if (handover && collectorId) {
      // unsold items are physically handed to the collector; remember who handed them over
      for (const l of p.unsold) {
        if (l.holderId === collectorId) continue;
        await tx.lootEntry.update({
          where: { id: l.id },
          data: { handedOverById: l.holderId, holderId: collectorId, handoverSettlementId: st.id },
        });
      }
    }
    return st;
  });
  await audit(me.id, "settlement_locked", `${title}: ${p.total} / ${p.shares.length} kişi`);
  revalidatePath("/settlements");
  redirect(`/settlements/${settlement.id}`);
}

export async function deleteSettlement(id: string) {
  const me = await requireRole("LEADER");
  const st = await prisma.settlement.findUniqueOrThrow({ where: { id }, include: { transfers: true } });
  if (st.transfers.some((t) => t.status !== "PENDING"))
    fail(`/settlements/${id}`, "Ödemesi başlamış hesap silinemez. Önce ödemeleri 'Bekliyor' durumuna al.");
  const handed = await prisma.lootEntry.findMany({ where: { handoverSettlementId: id } });
  await prisma.$transaction([
    prisma.lootEntry.updateMany({ where: { settlementId: id }, data: { settlementId: null } }),
    // give unsold handed-over items back to whoever delivered them (if still unsold)
    ...handed.map((l) =>
      prisma.lootEntry.update({
        where: { id: l.id },
        data:
          l.status === "IN_STOCK" && l.handedOverById
            ? { holderId: l.handedOverById, handedOverById: null, handoverSettlementId: null }
            : { handoverSettlementId: null },
      }),
    ),
    prisma.settlement.delete({ where: { id } }),
  ]);
  await audit(me.id, "settlement_deleted", st.title);
  revalidatePath("/settlements");
  done("/settlements", "Hesap silindi; loot kayıtları tekrar hesaplanabilir.");
}

export async function setTransferStatus(id: string, status: "PENDING" | "SENT" | "RECEIVED", backTo: string) {
  const me = await requireRole("OFFICER");
  const t = await prisma.transfer.findUniqueOrThrow({ where: { id } });
  await prisma.transfer.update({
    where: { id },
    data: {
      status,
      sentAt: status === "PENDING" ? null : (t.sentAt ?? new Date()),
      receivedAt: status === "RECEIVED" ? new Date() : null,
    },
  });
  await audit(me.id, "transfer_" + status.toLowerCase(), `${t.amount} ${t.fromId}->${t.toId}`);
  revalidatePath(backTo);
  redirect(backTo);
}
