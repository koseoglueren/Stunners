"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit, endSession, startSession } from "@/lib/auth";

const MAX_FAILS = 5;
const WINDOW_MIN = 15;

export type LoginState = { error: string; username: string } | null;

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const err = (error: string) => ({ error, username });
  if (!username || !password) return err("Kullanıcı adı ve şifre gerekli.");

  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const fails = await prisma.auditLog.count({
    where: { action: "login_failed", detail: username, createdAt: { gte: since } },
  });
  if (fails >= MAX_FAILS) return err(`Çok fazla hatalı deneme. ${WINDOW_MIN} dakika sonra tekrar dene.`);

  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    await audit(null, "login_failed", username);
    return err("Kullanıcı adı veya şifre hatalı.");
  }
  await startSession(user);
  await audit(user.id, "login");
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
