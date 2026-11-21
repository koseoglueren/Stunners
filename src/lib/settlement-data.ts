import "server-only";
import { prisma } from "./db";
import { computeSettlement, lootContribution } from "./settlement";

/** Loads sessions + their unsettled loot and computes the equal split preview. */
export async function buildSettlementPreview(sessionIds: string[]) {
  const sessions = await prisma.farmSession.findMany({
    where: { id: { in: sessionIds } },
    include: {
      location: true,
      members: { include: { user: true } },
      loot: { where: { settlementId: null }, include: { holder: true, soldBy: true, receiver: true } },
    },
    orderBy: { startAt: "asc" },
  });
  const users = new Map<string, { id: string; characterName: string }>();
  const memberIds: string[] = [];
  for (const s of sessions)
    for (const m of s.members) {
      memberIds.push(m.userId);
      users.set(m.userId, m.user);
    }
  const included = sessions.flatMap((s) =>
    s.loot.flatMap((l) => {
      const c = lootContribution(l);
      return c ? [{ loot: l, ...c }] : [];
    }),
  );
  for (const l of included) {
    const u = l.loot.status === "SOLD" ? l.loot.soldBy : l.loot.status === "GIVEN" ? l.loot.receiver : l.loot.holder;
    if (u) users.set(u.id, u);
  }
  const unsold = sessions.flatMap((s) => s.loot.filter((l) => l.status === "IN_STOCK"));
  const active = sessions.filter((s) => s.status === "ACTIVE");
  const result = computeSettlement(memberIds, included);
  return { sessions, users, included, unsold, active, ...result };
}
