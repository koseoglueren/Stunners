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
        plusLevel: plus ? parseInt(plus, 10) : null,
        holderId,
        value: value ?? price * BigInt(qty),
        status: "IN_STOCK",
        note: str(form, "note") || null,
      },
    });
  }
  revalidatePath(path);
  redirect(`${path}#loot`);
}

async function loadLootForEdit(lootId: string) {
  const me = await requireRole("OFFICER");
  const loot = await prisma.lootEntry.findUniqueOrThrow({ where: { id: lootId } });
  const path = `/farms/${loot.sessionId}`;
  if (loot.settlementId) fail(path, "Bu kayıt bir gün sonu hesabında kilitli.");
  return { me, loot, path };
}

export async function sellLoot(lootId: string, form: FormData) {
  const { me, loot, path } = await loadLootForEdit(lootId);
  const price = parseNoah(str(form, "salePrice"));
  if (!price || price <= 0n) fail(path, "Satış fiyatını gir (örn. 45m).");
  const soldById = str(form, "soldById") || loot.holderId;
  await prisma.lootEntry.update({
    where: { id: lootId },
    data: { status: "SOLD", salePrice: price, soldById, soldAt: new Date(), receiverId: null },
  });
  await audit(me.id, "loot_sold", `${loot.itemName} ${price}`);
  revalidatePath(path);
  revalidatePath("/stock");
  redirect(`${path}#loot`);
}

export async function giveLoot(lootId: string, form: FormData) {
  const { me, loot, path } = await loadLootForEdit(lootId);
  const receiverId = str(form, "receiverId");
  const value = parseNoah(str(form, "value"));
  if (!receiverId) fail(path, "Itemi alan üyeyi seç.");
  if (value === null || value < 0n) fail(path, "Itemin değerini gir; bu tutar alanın payından düşülür.");
  await prisma.lootEntry.update({
    where: { id: lootId },
    data: { status: "GIVEN", receiverId, value, salePrice: null, soldById: null, soldAt: null },
  });
  await audit(me.id, "loot_given", `${loot.itemName} -> ${receiverId} (${value})`);
  revalidatePath(path);
  redirect(`${path}#loot`);
}

export async function restockLoot(lootId: string) {
  const { me, loot, path } = await loadLootForEdit(lootId);
  if (loot.status === "COIN") fail(path, "Coin kaydı stoğa alınamaz.");
  await prisma.lootEntry.update({
    where: { id: lootId },
    data: { status: "IN_STOCK", salePrice: null, soldById: null, soldAt: null, receiverId: null },
  });
  await audit(me.id, "loot_restocked", loot.itemName);
  revalidatePath(path);
  redirect(`${path}#loot`);
}

export async function deleteLoot(lootId: string) {
  const { me, loot, path } = await loadLootForEdit(lootId);
  await prisma.lootEntry.delete({ where: { id: lootId } });
  await audit(me.id, "loot_deleted", `${loot.itemName} x${loot.quantity} (${loot.value})`);
  revalidatePath(path);
  redirect(`${path}#loot`);
}
