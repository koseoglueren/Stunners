"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { audit, requireUser, startSession } from "@/lib/auth";
import { done, fail, str } from "@/lib/forms";

export async function changePassword(form: FormData) {
  const me = await requireUser();
  const current = str(form, "current");
  const next = str(form, "next");
  if (!(await bcrypt.compare(current, me.passwordHash))) fail("/account", "Mevcut şifre yanlış.");
  if (next.length < 6) fail("/account", "Yeni şifre en az 6 karakter olmalı.");
  if (next !== str(form, "repeat")) fail("/account", "Yeni şifreler aynı değil.");
  const user = await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  await startSession(user);
  await audit(me.id, "password_changed");
  done("/account", "Şifren değişti.");
}
