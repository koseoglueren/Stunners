import "server-only";
import { prisma } from "./db";
import { computeSettlement, lootContribution } from "./settlement";
import { lootBeneficiaries } from "./shares";

/** Loads sessions + their unsettled loot and computes who gets what. */
export async function buildSettlementPreview(sessionIds: string[], collectorId: string) {
  const sessions = await prisma.farmSession.findMany({
    where: { id: { in: sessionIds } },
    include: {
      location: true,
      members: { include: { user: true } },
      loot: {
        where: { settlementId: null },
        include: { holder: true, soldBy: true, receiver: true, owners: { include: { user: true } } },
      },
    },
    orderBy: { startAt: "asc" },
  });
  const users = new Map<string, { id: string; characterName: string }>();
  for (const s of sessions) for (const m of s.members) users.set(m.userId, m.user);
  const included = sessions.flatMap((s) =>
    s.loot.flatMap((l) => {
      const c = lootContribution(l);
      if (!c) return [];
      for (const o of l.owners) users.set(o.userId, o.user);
      return [{ loot: l, ...c, beneficiaries: lootBeneficiaries(l, s) }];
    }),
  );
  for (const l of included) {
    const u = l.loot.status === "SOLD" ? l.loot.soldBy : l.loot.status === "GIVEN" ? l.loot.receiver : l.loot.holder;
    if (u) users.set(u.id, u);
  }
  const unsold = sessions.flatMap((s) => s.loot.filter((l) => l.status === "IN_STOCK"));
  for (const l of unsold) users.set(l.holder.id, l.holder);
  const collector = await prisma.user.findUnique({ where: { id: collectorId } });
  if (collector) users.set(collector.id, collector);
  const active = sessions.filter((s) => s.status === "ACTIVE");
  const result = computeSettlement(included, collector?.id ?? collectorId);
  return { sessions, users, included, unsold, active, collector, ...result };
}
