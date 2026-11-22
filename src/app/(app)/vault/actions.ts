"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { done, fail, str } from "@/lib/forms";

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
