"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { CharClass, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { done, fail, str } from "@/lib/forms";

const CLASSES = ["WARRIOR", "ROGUE", "MAGE", "PRIEST", "KURIAN"];
const ROLES = ["LEADER", "OFFICER", "MEMBER"];

function readProfile(form: FormData) {
  const characterName = str(form, "characterName");
  const cls = str(form, "charClass");
  const lvl = str(form, "level");
  const role = str(form, "role");
  return {
    characterName,
    charClass: CLASSES.includes(cls) ? (cls as CharClass) : null,
    level: lvl ? Math.max(1, Math.min(99, parseInt(lvl, 10) || 1)) : null,
    role: (ROLES.includes(role) ? role : "MEMBER") as Role,
    note: str(form, "note") || null,
  };
}

export async function createMember(form: FormData) {
  const me = await requireRole("LEADER");
  const username = str(form, "username").toLowerCase();
  const password = str(form, "password");
  const data = readProfile(form);
  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) fail("/members/new", "Kullanıcı adı 3-24 karakter olmalı (harf, rakam, _ . -).");
  if (password.length < 6) fail("/members/new", "Şifre en az 6 karakter olmalı.");
  if (!data.characterName) fail("/members/new", "Karakter adı gerekli.");
  if (await prisma.user.findUnique({ where: { username } })) fail("/members/new", "Bu kullanıcı adı zaten var.");
  const user = await prisma.user.create({
    data: { ...data, username, passwordHash: await bcrypt.hash(password, 10) },
  });
  await audit(me.id, "member_created", `${user.username} (${user.characterName})`);
  revalidatePath("/members");
  done("/members", `${user.characterName} eklendi.`);
}

export async function updateMember(id: string, form: FormData) {
  const me = await requireRole("LEADER");
  const data = readProfile(form);
  const path = `/members/${id}`;
  if (!data.characterName) fail(path, "Karakter adı gerekli.");
  if (id === me.id && data.role !== "LEADER") fail(path, "Kendi Lider rolünü kaldıramazsın.");
  await prisma.user.update({ where: { id }, data });
  await audit(me.id, "member_updated", `${data.characterName} rol=${data.role}`);
  revalidatePath(path);
  done(path, "Üye güncellendi.");
}

export async function setMemberActive(id: string, active: boolean) {
  const me = await requireRole("LEADER");
  if (id === me.id) fail(`/members/${id}`, "Kendini pasife alamazsın.");
  const u = await prisma.user.update({ where: { id }, data: { active } });
  await audit(me.id, active ? "member_activated" : "member_deactivated", u.characterName);
  revalidatePath("/members");
  done(`/members/${id}`, active ? "Üye tekrar aktif." : "Üye pasife alındı. Geçmiş kayıtları korunur.");
}

export async function resetPassword(id: string, form: FormData) {
  const me = await requireRole("LEADER");
  const password = str(form, "password");
  if (password.length < 6) fail(`/members/${id}`, "Şifre en az 6 karakter olmalı.");
  const u = await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await audit(me.id, "password_reset", u.username);
  done(`/members/${id}`, "Şifre değiştirildi. Üyenin açık oturumları kapandı.");
}
