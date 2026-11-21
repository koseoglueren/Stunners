import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role, User } from "@prisma/client";
import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, signToken, verifyToken } from "./session-token";

/** Token version: changes whenever the password hash changes, so old sessions die. */
export function tokenVersion(user: Pick<User, "passwordHash">) {
  return user.passwordHash.slice(-12);
}

export async function startSession(user: User) {
  const token = await signToken({ uid: user.id, ver: tokenVersion(user) });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const payload = await verifyToken(jar.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || !user.active || tokenVersion(user) !== payload.ver) return null;
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

const RANK: Record<Role, number> = { MEMBER: 0, OFFICER: 1, LEADER: 2 };

export function hasRole(user: Pick<User, "role">, min: Role) {
  return RANK[user.role] >= RANK[min];
}

export async function requireRole(min: Role) {
  const user = await requireUser();
  if (!hasRole(user, min)) redirect("/?yetki=yok");
  return user;
}

export async function audit(userId: string | null, action: string, detail?: string) {
  await prisma.auditLog.create({ data: { userId, action, detail } });
}
