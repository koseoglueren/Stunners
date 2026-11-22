import "server-only";
import { prisma } from "./db";

/** the member whose game account is used as the clan vault (kasa) */
export async function getTreasurer() {
  const row = await prisma.setting.findUnique({ where: { key: "treasurerId" } });
  if (row) {
    const u = await prisma.user.findUnique({ where: { id: row.value } });
    if (u?.active) return u;
  }
  // fallback: first leader
  return prisma.user.findFirst({ where: { role: "LEADER", active: true }, orderBy: { createdAt: "asc" } });
}
