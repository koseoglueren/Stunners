"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { fail, done, str } from "@/lib/forms";
import { buildSettlementPreview } from "@/lib/settlement-data";
import { getTreasurer } from "@/lib/clan";

type Preview = Awaited<ReturnType<typeof buildSettlementPreview>>;

/** writes a locked settlement for the previewed farms and locks their loot */
async function lockSettlement(p: Preview, ids: string[], collectorId: string, title: string, createdById: string, handover: boolean) {
  return prisma.$transaction(async (tx) => {
    // guard against a parallel lock of the same loot
    const lootIds = p.included.map((i) => i.loot.id);
    const stillFree = await tx.lootEntry.count({ where: { id: { in: lootIds }, settlementId: null } });
    if (stillFree !== lootIds.length) throw new Error("Loot başka bir hesapta kilitlendi, sayfayı yenile.");
    const st = await tx.settlement.create({
      data: {
        title,
        status: "LOCKED",
        mode: "COLLECTOR",
        collectorId: collectorId || null,
        total: p.total,
        perShare: p.perShare,
        remainder: p.remainder,
        createdById,
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
}

export async function createSettlement(form: FormData) {
  const me = await requireRole("OFFICER");
  const ids = form.getAll("sessionIds").map(String).filter(Boolean);
  const collectorId = str(form, "collectorId");
  const handover = form.get("handover") === "1";
  const merged = form.get("merged") === "1";
  const back = `/settlements/new?${ids.map((i) => `oturum=${i}`).join("&")}${merged ? "&birlestir=1" : ""}`;
  if (ids.length === 0) fail("/settlements/new", "En az bir farm seç.");
  if (!collectorId) fail(back, "Kasa hesabını (farmı teslim alacak üye) seç.");
  const p = await buildSettlementPreview(ids, collectorId, merged);
  if (!p.collector) fail(back, "Kasa hesabı üyesi bulunamadı.");
  if (p.active.length) fail(back, "Devam eden farm var; önce farmı bitir.");
  if (p.included.length === 0 && !(handover && p.unsold.length)) fail(back, "Hesaplanacak coin veya satılmış item yok.");
  const day = new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  const title = str(form, "title") || `${merged ? "Birleşik gün sonu" : "Gün sonu"} ${day}`;
  const settlement = await lockSettlement(p, ids, collectorId, title, me.id, handover);
  await audit(me.id, merged ? "settlement_locked_merged" : "settlement_locked", `${title}: ${p.total} / ${p.shares.length} kişi`);
  revalidatePath("/vault");
  revalidatePath("/settlements");
  redirect(`/settlements/${settlement.id}`);
}

/**
 * Two (or more) farm teams share the day: the chosen settlements are undone and redone as
 * one settlement where the whole pool is split equally among everyone in those farms.
 * Only settlements whose payouts haven't started can be merged.
 */
export async function mergeSettlements(form: FormData) {
  const me = await requireRole("OFFICER");
  const ids = [...new Set(form.getAll("sel").map(String).filter(Boolean))];
  if (ids.length < 2) fail("/settlements", "Birleştirmek için en az iki hesap seç.");
  const list = await prisma.settlement.findMany({ where: { id: { in: ids } }, include: { transfers: true, sessions: true } });
  if (list.length !== ids.length) fail("/settlements", "Seçilen hesaplardan biri bulunamadı.");
  if (list.some((s) => s.transfers.some((t) => t.status !== "PENDING")))
    fail("/settlements", "Ödemesi başlamış hesap birleştirilemez. Önce o hesabın ödemelerini 'Bekliyor' durumuna al.");
  if (list.some((s) => s.sessions.length === 0)) fail("/settlements", "Satış dağıtımları farmlarla birleştirilemez; sadece farm hesaplarını seç.");
  const sessionIds = [...new Set(list.flatMap((s) => s.sessions.map((x) => x.sessionId)))];
  const collectorId = list[0].collectorId ?? (await getTreasurer())?.id ?? me.id;

  // undo the old settlements (handed-over items stay with the vault account)
  await prisma.$transaction([
    prisma.lootEntry.updateMany({ where: { settlementId: { in: ids } }, data: { settlementId: null } }),
    prisma.lootEntry.updateMany({ where: { handoverSettlementId: { in: ids } }, data: { handoverSettlementId: null } }),
    prisma.settlement.deleteMany({ where: { id: { in: ids } } }),
  ]);
  const p = await buildSettlementPreview(sessionIds, collectorId, true);
  const title = `Birleşik gün sonu ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`;
  const st = await lockSettlement(p, sessionIds, collectorId, title, me.id, true);
  await audit(me.id, "settlements_merged", `${list.map((s) => s.title).join(" + ")} -> ${title}: ${p.total} / ${p.shares.length} kişi`);
  revalidatePath("/vault");
  revalidatePath("/settlements");
  revalidatePath("/payim");
  redirect(`/settlements/${st.id}`);
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
  revalidatePath("/vault");
  redirect(backTo);
}
