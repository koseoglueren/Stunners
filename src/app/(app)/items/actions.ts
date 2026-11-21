"use server";

import { revalidatePath } from "next/cache";
import type { LootCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { categoryLabel, parseNoah } from "@/lib/format";
import { done, fail, str } from "@/lib/forms";

export async function createItem(form: FormData) {
  const me = await requireRole("OFFICER");
  const name = str(form, "name");
  const category = str(form, "category") as LootCategory;
  if (!name) fail("/items", "Item adı gerekli.");
  if (!(category in categoryLabel) || category === "COIN") fail("/items", "Kategori seç.");
  if (await prisma.itemCatalog.findUnique({ where: { name } })) fail("/items", "Bu item zaten katalogda.");
  await prisma.itemCatalog.create({ data: { name, category, defaultPrice: parseNoah(str(form, "price")) ?? 0n } });
  await audit(me.id, "item_created", name);
  revalidatePath("/items");
  done("/items", `${name} eklendi.`);
}

export async function updateItem(id: string, form: FormData) {
  const me = await requireRole("OFFICER");
  const price = parseNoah(str(form, "price"));
  if (price === null) fail("/items", "Geçerli bir fiyat gir.");
  const it = await prisma.itemCatalog.update({ where: { id }, data: { defaultPrice: price, active: form.get("active") === "on" } });
  await audit(me.id, "item_updated", `${it.name} ${price}`);
  revalidatePath("/items");
  done("/items", `${it.name} güncellendi.`);
}
