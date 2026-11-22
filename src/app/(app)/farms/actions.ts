"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LootCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { categoryLabel, parseNoah } from "@/lib/format";
import { done, fail, str } from "@/lib/forms";

const CATEGORIES = Object.keys(categoryLabel) as LootCategory[];

function readDate(form: FormData, key: string) {
  const v = str(form, key);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

async function isLocked(sessionId: string) {
  const n = await prisma.settlementSession.count({ where: { sessionId } });
  return n > 0;
}

export async function createSession(form: FormData) {
  const me = await requireRole("OFFICER");
  const locationId = str(form, "locationId");
  const startAt = readDate(form, "startAt") ?? new Date();
  const memberIds = form.getAll("memberIds").map(String).filter(Boolean);
  if (!locationId) fail("/farms/new", "Farm yeri seç.");
  if (memberIds.length === 0) fail("/farms/new", "En az bir ekip üyesi seç.");
  const s = await prisma.farmSession.create({
    data: {
      locationId,
      startAt,
      title: str(form, "title") || null,
      note: str(form, "note") || null,
      createdById: me.id,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: { location: true },
  });
  await audit(me.id, "session_created", `${s.location.name} (${memberIds.length} kişi)`);
  revalidatePath("/farms");
  redirect(`/farms/${s.id}`);
}

export async function updateSession(id: string, form: FormData) {
  const me = await requireRole("OFFICER");
  const path = `/farms/${id}`;
  if (await isLocked(id)) fail(path, "Bu farm bir gün sonu hesabına dahil; önce hesabı silmek gerekir.");
  const memberIds = form.getAll("memberIds").map(String).filter(Boolean);
  if (memberIds.length === 0) fail(path, "En az bir ekip üyesi seç.");
  const startAt = readDate(form, "startAt");
  const endAt = readDate(form, "endAt");
  if (startAt && endAt && endAt < startAt) fail(path, "Bitiş saati başlangıçtan önce olamaz.");
  await prisma.$transaction([
    prisma.sessionMember.deleteMany({ where: { sessionId: id, userId: { notIn: memberIds } } }),
    prisma.sessionMember.createMany({ data: memberIds.map((userId) => ({ sessionId: id, userId })), skipDuplicates: true }),
    prisma.farmSession.update({
      where: { id },
      data: {
        locationId: str(form, "locationId") || undefined,
        title: str(form, "title") || null,
        note: str(form, "note") || null,
        ...(startAt ? { startAt } : {}),
        ...(endAt ? { endAt } : {}),
      },
    }),
  ]);
  await audit(me.id, "session_updated", id);
  revalidatePath(path);
  done(path, "Farm güncellendi.");
}

export async function finishSession(id: string, form: FormData) {
  const me = await requireRole("OFFICER");
  const s = await prisma.farmSession.findUniqueOrThrow({ where: { id } });
  const endAt = readDate(form, "endAt") ?? new Date();
  if (endAt < s.startAt) fail(`/farms/${id}`, "Bitiş saati başlangıçtan önce olamaz.");
  await prisma.farmSession.update({ where: { id }, data: { endAt, status: "FINISHED" } });
  await audit(me.id, "session_finished", id);
  revalidatePath(`/farms/${id}`);
  done(`/farms/${id}`, "Farm bitirildi. Itemleri satınca veya dağıtınca gün sonu hesabını yapabilirsin.");
}

export async function reopenSession(id: string) {
  const me = await requireRole("OFFICER");
  if (await isLocked(id)) fail(`/farms/${id}`, "Hesaba dahil farm tekrar açılamaz.");
  await prisma.farmSession.update({ where: { id }, data: { endAt: null, status: "ACTIVE" } });
  await audit(me.id, "session_reopened", id);
  revalidatePath(`/farms/${id}`);
  done(`/farms/${id}`, "Farm tekrar açıldı.");
}

export async function deleteSession(id: string) {
  const me = await requireRole("LEADER");
  if (await isLocked(id)) fail(`/farms/${id}`, "Hesaba dahil farm silinemez.");
  await prisma.farmSession.delete({ where: { id } });
  await audit(me.id, "session_deleted", id);
  revalidatePath("/farms");
  done("/farms", "Farm silindi.");
}

export async function addLoot(sessionId: string, form: FormData) {
  await requireRole("OFFICER");
  const path = `/farms/${sessionId}`;
  const category = str(form, "category") as LootCategory;
  if (!CATEGORIES.includes(category)) fail(path, "Kategori seç.");
  const holderId = str(form, "holderId");
  if (!holderId) fail(path, "Item / coin kimde, seç.");
  const qty = Math.max(1, parseInt(str(form, "quantity") || "1", 10) || 1);
  const plus = str(form, "plusLevel");
  const value = parseNoah(str(form, "value"));

  if (category === "COIN") {
    if (!value || value <= 0n) fail(path, "Coin miktarını gir (örn. 150m).");
    await prisma.lootEntry.create({
      data: { sessionId, category, itemName: "Noah", quantity: 1, holderId, value, status: "COIN", note: str(form, "note") || null },
    });
  } else {
    const itemId = str(form, "itemId") || null;
    let itemName = str(form, "itemName");
    let price = 0n;
    if (itemId) {
      const item = await prisma.itemCatalog.findUnique({ where: { id: itemId } });
      if (!item) fail(path, "Item bulunamadı.");
      itemName = item.name;
      price = item.defaultPrice;
    }
    if (!itemName) fail(path, "Item seç veya adını yaz.");
    await prisma.lootEntry.create({
      data: {
        sessionId,
        category,
        itemId,
        itemName,
        quantity: qty,
        plusLevel: plus !== "" ? Math.max(0, Math.min(15, parseInt(plus, 10) || 0)) : null,
        holderId,
        value: value ?? price * BigInt(qty),
        status: "IN_STOCK",
        droppedAt: readDate(form, "droppedAt") ?? new Date(),
        inVault: form.get("vault") === "on",
        vaultAt: form.get("vault") === "on" ? new Date() : null,
        note: str(form, "note") || null,
      },
    });
  }
  revalidatePath(path);
  revalidatePath("/vault");
  redirect(`${path}#loot`);
}

/** where to go after a loot action: the vault page if asked, else the loot's farm */
function backPath(loot: { sessionId: string | null }, back?: string | null) {
  if (back && back.startsWith("/") && !back.startsWith("//")) return back;
  return loot.sessionId ? `/farms/${loot.sessionId}#loot` : "/vault";
}

async function loadLootForEdit(lootId: string, back?: string | null) {
  const me = await requireRole("OFFICER");
  const loot = await prisma.lootEntry.findUniqueOrThrow({ where: { id: lootId } });
  const path = backPath(loot, back);
  if (loot.settlementId) fail(path, "Bu kayıt bir gün sonu hesabında kilitli.");
  return { me, loot, path };
}

function revalidateLoot(loot: { sessionId: string | null }) {
  if (loot.sessionId) revalidatePath(`/farms/${loot.sessionId}`);
  revalidatePath("/vault");
}

export async function sellLoot(lootId: string, form: FormData) {
  const { me, loot, path } = await loadLootForEdit(lootId, str(form, "back"));
  const price = parseNoah(str(form, "salePrice"));
  if (!price || price <= 0n) fail(path, "Satış fiyatını gir (örn. 45m).");
  const soldById = str(form, "soldById") || loot.holderId;
  await prisma.lootEntry.update({
    where: { id: lootId },
    data: { status: "SOLD", salePrice: price, soldById, soldAt: new Date(), receiverId: null },
  });
  await audit(me.id, "loot_sold", `${loot.itemName} ${price}`);
  revalidateLoot(loot);
  redirect(path);
}

export async function restockLoot(lootId: string, back?: string) {
  const { me, loot, path } = await loadLootForEdit(lootId, back);
  if (loot.status === "COIN") fail(path, "Coin kaydı stoğa alınamaz.");
  await prisma.lootEntry.update({
    where: { id: lootId },
    data: { status: "IN_STOCK", salePrice: null, soldById: null, soldAt: null, receiverId: null },
  });
  await audit(me.id, "loot_restocked", loot.itemName);
  revalidateLoot(loot);
  redirect(path);
}

export async function setLootVault(lootId: string, inVault: boolean, back?: string) {
  const { me, loot, path } = await loadLootForEdit(lootId, back);
  if (loot.status !== "IN_STOCK") fail(path, "Sadece satılmamış itemler clan kasasına girer.");
  if (!inVault && !loot.sessionId) fail(path, "Elle eklenen item kasadan çıkarılamaz; satabilir veya silebilirsin.");
  await prisma.lootEntry.update({ where: { id: lootId }, data: { inVault, vaultAt: inVault ? new Date() : null } });
  await audit(me.id, inVault ? "vault_added" : "vault_removed", loot.itemName);
  revalidateLoot(loot);
  redirect(path);
}

export async function updateLootValue(lootId: string, form: FormData) {
  const { me, loot, path } = await loadLootForEdit(lootId, str(form, "back"));
  const value = parseNoah(str(form, "value"));
  if (value === null) fail(path, "Geçerli bir değer gir.");
  await prisma.lootEntry.update({ where: { id: lootId }, data: { value } });
  await audit(me.id, "loot_value", `${loot.itemName} ${value}`);
  revalidateLoot(loot);
  redirect(path);
}

export async function deleteLoot(lootId: string, back?: string) {
  const { me, loot, path } = await loadLootForEdit(lootId, back);
  await prisma.lootEntry.delete({ where: { id: lootId } });
  await audit(me.id, "loot_deleted", `${loot.itemName} x${loot.quantity} (${loot.value})`);
  revalidateLoot(loot);
  redirect(path);
}

/** Manual add straight into the clan vault, optionally tied to a farm (then its team shares the sale). */
export async function addVaultItem(form: FormData) {
  const me = await requireRole("OFFICER");
  const category = str(form, "category") as LootCategory;
  if (!CATEGORIES.includes(category) || category === "COIN") fail("/vault", "Kategori seç.");
  const itemId = str(form, "itemId") || null;
  let itemName = str(form, "itemName");
  let price = 0n;
  if (itemId) {
    const item = await prisma.itemCatalog.findUnique({ where: { id: itemId } });
    if (!item) fail("/vault", "Item bulunamadı.");
    itemName = item.name;
    price = item.defaultPrice;
  }
  if (!itemName) fail("/vault", "Item seç veya adını yaz.");
  const qty = Math.max(1, parseInt(str(form, "quantity") || "1", 10) || 1);
  const plus = str(form, "plusLevel");
  const sessionId = str(form, "sessionId");
  if (!sessionId) fail("/vault", "Itemin hangi farmdan geldiğini seç; pay sahipleri o farmın ekibi olur.");
  const session = await prisma.farmSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("/vault", "Farm bulunamadı.");
  const now = new Date();
  // treat the item as dropped during the farm (at its end if added later), so the default owners are the party at that time
  const droppedAt = session.endAt && now > session.endAt ? session.endAt : now < session.startAt ? session.startAt : now;
  const holderId = str(form, "holderId") || me.id;
  const value = parseNoah(str(form, "value"));
  await prisma.lootEntry.create({
    data: {
      sessionId,
      category,
      itemId,
      itemName,
      quantity: qty,
      plusLevel: plus !== "" ? Math.max(0, Math.min(15, parseInt(plus, 10) || 0)) : null,
      holderId,
      value: value ?? price * BigInt(qty),
      status: "IN_STOCK",
      inVault: true,
      vaultAt: now,
      droppedAt,
      note: str(form, "note") || null,
    },
  });
  await audit(me.id, "vault_manual_add", itemName);
  revalidatePath("/vault");
  revalidatePath(`/farms/${sessionId}`);
  done("/vault", `${itemName} clan kasasına eklendi.`);
}

/** admin edits who has a share in an item; empty or same as default = back to the farm party */
export async function setLootOwners(lootId: string, form: FormData) {
  const { me, loot, path } = await loadLootForEdit(lootId, str(form, "back"));
  if (loot.status === "COIN") fail(path, "Coin, farm ekibine süreye göre bölünür; pay sahibi seçilmez.");
  const ids = [...new Set(form.getAll("ownerIds").map(String).filter(Boolean))];
  if (ids.length === 0) fail(path, "En az bir pay sahibi seç.");
  await prisma.$transaction([
    prisma.lootOwner.deleteMany({ where: { lootId } }),
    prisma.lootOwner.createMany({ data: ids.map((userId) => ({ lootId, userId })) }),
    prisma.lootEntry.update({ where: { id: lootId }, data: { customOwners: true } }),
  ]);
  await audit(me.id, "loot_owners", `${loot.itemName}: ${ids.length} kişi`);
  revalidateLoot(loot);
  redirect(path);
}

export async function resetLootOwners(lootId: string, back?: string) {
  const { me, loot, path } = await loadLootForEdit(lootId, back);
  await prisma.$transaction([
    prisma.lootOwner.deleteMany({ where: { lootId } }),
    prisma.lootEntry.update({ where: { id: lootId }, data: { customOwners: false } }),
  ]);
  await audit(me.id, "loot_owners_reset", loot.itemName);
  revalidateLoot(loot);
  redirect(path);
}

/** add someone who joins the party after the farm started, with the time they joined */
export async function addPartyMember(sessionId: string, form: FormData) {
  const me = await requireRole("OFFICER");
  const path = `/farms/${sessionId}`;
  if (await isLocked(sessionId)) fail(path, "Hesaba dahil farmın ekibi değiştirilemez.");
  const s = await prisma.farmSession.findUniqueOrThrow({ where: { id: sessionId } });
  const userId = str(form, "userId");
  if (!userId) fail(path, "Partiye katılan üyeyi seç.");
  const joinedAt = readDate(form, "joinedAt") ?? new Date();
  if (joinedAt < s.startAt) fail(path, "Katılış saati farm başlangıcından önce olamaz.");
  if (s.endAt && joinedAt > s.endAt) fail(path, "Katılış saati farm bitişinden sonra olamaz.");
  await prisma.sessionMember.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId, joinedAt },
    update: { joinedAt, leftAt: null },
  });
  await audit(me.id, "party_joined", `${sessionId} ${userId}`);
  revalidatePath(path);
  done(path, "Üye partiye eklendi; coin payı katıldığı saatten itibaren hesaplanır.");
}

/** fix a member's join / leave time (empty = from start / until end) */
export async function setMemberTimes(sessionId: string, userId: string, form: FormData) {
  const me = await requireRole("OFFICER");
  const path = `/farms/${sessionId}`;
  if (await isLocked(sessionId)) fail(path, "Hesaba dahil farmın ekibi değiştirilemez.");
  const s = await prisma.farmSession.findUniqueOrThrow({ where: { id: sessionId } });
  let joinedAt = readDate(form, "joinedAt");
  let leftAt = readDate(form, "leftAt");
  if (joinedAt && joinedAt <= s.startAt) joinedAt = null;
  if (leftAt && s.endAt && leftAt >= s.endAt) leftAt = null;
  if (joinedAt && leftAt && leftAt <= joinedAt) fail(path, "Ayrılış saati katılış saatinden sonra olmalı.");
  await prisma.sessionMember.update({ where: { sessionId_userId: { sessionId, userId } }, data: { joinedAt, leftAt } });
  await audit(me.id, "party_times", `${sessionId} ${userId}`);
  revalidatePath(path);
  done(path, "Saatler güncellendi.");
}
