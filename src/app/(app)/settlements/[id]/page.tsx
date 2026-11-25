import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { durationText, lootStatusLabel, noah, noahShort } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { lootContribution } from "@/lib/settlement";
import { PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { CopyButton, LocalTime, SubmitButton } from "@/components/client";
import { deleteSettlement } from "../actions";
import { ItemSummary, PayoutList } from "@/components/SettlementParts";

export default async function SettlementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const st = await prisma.settlement.findUnique({
    where: { id },
    include: {
      createdBy: true,
      sessions: { include: { session: { include: { location: true, loot: true, _count: { select: { members: true } } } } } },
      shares: { include: { user: true } },
      transfers: { include: { from: true, to: true }, orderBy: { amount: "desc" } },
      loot: { include: { holder: true, soldBy: true, receiver: true, handedOverBy: true } },
      handover: true,
      collector: true,
    },
  });
  if (!st) notFound();
  const shares = [...st.shares].sort((a, b) =>
    a.user.characterName.localeCompare(b.user.characterName, "tr"),
  );
  const path = `/settlements/${id}`;
  const users = new Map<string, string>();
  for (const s of st.shares) users.set(s.userId, s.user.characterName);
  for (const t of st.transfers) {
    users.set(t.fromId, t.from.characterName);
    users.set(t.toId, t.to.characterName);
  }
  if (st.collector) users.set(st.collector.id, st.collector.characterName);
  const name = (uid: string) => users.get(uid) ?? "?";
  const collectorId = st.collectorId ?? st.createdById;
  const payouts = st.transfers.filter((t) => t.kind === "PAYOUT" || t.kind === "DIRECT");
  const summary = [
    `${st.title}: toplam ${noah(st.total)} Noah. Kasa hesabı: ${name(collectorId)}`,
    "Ödemeler:",
    ...shares.filter((s) => s.share > 0n && s.userId !== collectorId).map((s) => `- ${name(s.userId)}: ${noah(payouts.find((t) => t.toId === s.userId)?.amount ?? s.share)} Noah`),
  ].join("\n");
  const farmLoot = st.sessions.flatMap((x) => x.session.loot);

  return (
    <>
      <PageHeader
        title={st.title}
        subtitle={
          <>
            Kasa hesabı: <b className="text-gold">{name(collectorId)}</b> ·{" "}
            Kilitleyen: {st.createdBy.characterName} · <LocalTime value={st.lockedAt ?? st.createdAt} />
          </>
        }
        actions={
          <>
            <CopyButton text={summary} />
            <Link href="/settlements" className="btn-ghost">← Hesaplar</Link>
          </>
        }
      />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Toplam" value={noahShort(st.total)} hint={`${noah(st.total)} Noah`} accent />
        <Stat label="Ortalama pay" value={noahShort(st.perShare)} hint={st.sessions.length ? "Coin süreye, item pay sahiplerine göre" : "Seçilen kişilere eşit"} />
        <Stat label="Katılımcı" value={shares.filter((s) => s.share > 0n).length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <PayoutList shares={shares} payouts={payouts} collectorId={collectorId} name={name} live={{ me: me.id, officer: hasRole(me, "OFFICER"), backTo: path }} />
          {st.sessions.length > 0 && <ItemSummary loot={farmLoot} />}
        </div>
        <div className="space-y-6">
          {st.sessions.length > 0 && (
          <div className="card">
            <h2 className="mb-2 font-semibold">Farmlar</h2>
            <ul className="space-y-1 text-sm">
              {st.sessions.map(({ session: s }) => (
                <li key={s.id} className="flex justify-between">
                  <Link href={`/farms/${s.id}`} className="hover:text-gold">{s.location.name}{s.title ? ` · ${s.title}` : ""}</Link>
                  <span className="text-mute"><LocalTime value={s.startAt} /> · {durationText(s.startAt, s.endAt)} · {s._count.members} kişi</span>
                </li>
              ))}
            </ul>
          </div>
          )}
          <div className="card">
            <h2 className="mb-2 font-semibold">Hesaba giren kayıtlar ({st.loot.length})</h2>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {st.loot.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span>
                    {l.itemName}{l.plusLevel !== null ? ` +${l.plusLevel}` : ""}{l.quantity > 1 ? ` ×${l.quantity}` : ""}{" "}
                    <span className="text-xs text-mute">
                      ({lootStatusLabel[l.status]} ·{" "}
                      {l.status === "SOLD" ? <>satan: <b className="text-ink">{(l.soldBy ?? l.holder).characterName}</b></> : <>getiren: <b className="text-ink">{(l.handedOverBy ?? l.holder).characterName}</b></>})
                    </span>
                  </span>
                  <span>{noah(lootContribution(l)?.amount ?? 0n)}</span>
                </li>
              ))}
            </ul>
          </div>
          {hasRole(me, "LEADER") && (
            <form action={deleteSettlement.bind(null, st.id)} className="card space-y-2">
              <h2 className="font-semibold">Hesabı sil</h2>
              <p className="text-sm text-mute">Hata varsa hesabı silip loot kayıtlarını düzelttikten sonra tekrar hesaplayabilirsin. Ödemesi başlamış hesap silinemez.</p>
              <SubmitButton className="btn-danger btn-sm" confirm="Hesap silinsin mi?">Hesabı sil</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
