"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { done, fail, str } from "@/lib/forms";

export async function createLocation(form: FormData) {
  const me = await requireRole("LEADER");
  const name = str(form, "name");
  if (!name) fail("/settings", "Farm yeri adı gerekli.");
  if (await prisma.farmLocation.findUnique({ where: { name } })) fail("/settings", "Bu farm yeri zaten var.");
  await prisma.farmLocation.create({ data: { name } });
  await audit(me.id, "location_created", name);
  revalidatePath("/settings");
  done("/settings", `${name} eklendi.`);
}

export async function toggleLocation(id: string) {
  const me = await requireRole("LEADER");
  const l = await prisma.farmLocation.findUniqueOrThrow({ where: { id } });
  await prisma.farmLocation.update({ where: { id }, data: { active: !l.active } });
  await audit(me.id, "location_toggled", l.name);
  revalidatePath("/settings");
  done("/settings", `${l.name} ${l.active ? "gizlendi" : "tekrar listede"}.`);
}
