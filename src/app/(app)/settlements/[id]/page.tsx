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
import { TransferTable } from "@/components/TransferTable";
import { deleteSettlement } from "../actions";
import { CollectorReport } from "@/components/CollectorReport";
import { buildCollectorRows } from "@/lib/collector-report";

export default async function SettlementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const st = await prisma.settlement.findUnique({
    where: { id },
    include: {
      createdBy: true,
      sessions: { include: { session: { include: { location: true, _count: { select: { members: true } } } } } },
      shares: { include: { user: true } },
      transfers: { include: { from: true, to: true }, orderBy: { amount: "desc" } },
      loot: { include: { holder: true, soldBy: true, receiver: true } },
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
  const collectorMode = st.mode === "COLLECTOR" && st.collectorId;
  const rows = collectorMode
    ? buildCollectorRows(st.collectorId!, st.shares, st.transfers, st.loot, st.handover)
    : [];
  const summary = collectorMode
    ? [
        `${st.title}: toplam ${noah(st.total)} Noah, ortalama pay ${noah(st.perShare)}. Kasa hesabı: ${name(st.collectorId!)}`,
        "Teslim:",
        ...rows.filter((r) => r.delivery || r.items.length).map((r) => `- ${name(r.userId)}: ${r.delivery ? noah(r.delivery.amount) + " Noah" : ""}${r.items.length ? (r.delivery ? " + " : "") + r.items.join(", ") : ""}`),
        "Ödeme:",
        ...rows.filter((r) => r.payout).map((r) => `- ${name(r.userId)}: ${noah(r.payout!.amount)} Noah`),
      ].join("\n")
    : [
        `${st.title}: toplam ${noah(st.total)} Noah, kişi başı ${noah(st.perShare)}.`,
        ...st.transfers.map((t) => `- ${t.from.characterName} → ${t.to.characterName}: ${noah(t.amount)} Noah`),
      ].join("\n");

  return (
    <>
      <PageHeader
        title={st.title}
        subtitle={
          <>
            {collectorMode && <>Kasa hesabı: <b className="text-gold">{name(st.collectorId!)}</b> · </>}
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
        <Stat label="Ortalama pay" value={noahShort(st.perShare)} hint="Coin süreye, item pay sahiplerine göre" />
        <Stat label="Katılımcı" value={shares.filter((s) => s.share > 0n).length} />
      </div>

      {collectorMode ? (
        <div className="mb-6">
          <CollectorReport rows={rows} collectorId={st.collectorId!} name={name} live={{ me: me.id, officer: hasRole(me, "OFFICER"), backTo: path }} />
        </div>
      ) : (
        <div className="card mb-6 p-0">
          <h2 className="px-5 pt-5 font-semibold">Kim kime ne verecek</h2>
          {st.transfers.length === 0 ? (
            <p className="p-5 text-sm text-mute">Transfer gerekmiyor.</p>
          ) : (
            <TransferTable transfers={st.transfers} me={me.id} officer={hasRole(me, "OFFICER")} backTo={path} />
          )}
        </div>
      )}

      <div className={collectorMode ? "grid gap-6 xl:grid-cols-3" : "grid gap-6 xl:grid-cols-2"}>
        <div className={`card overflow-x-auto p-0 ${collectorMode ? "hidden" : ""}`}>
          <h2 className="px-5 pt-5 font-semibold">Paylar</h2>
          <table className="table mt-2">
            <thead>
              <tr>
                <th>Üye</th>
                <th className="text-right">Elindeydi</th>
                <th className="text-right">Payı</th>
                <th className="text-right">Fark</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((s) => (
                <tr key={s.id} className={s.userId === me.id ? "bg-gold/5" : ""}>
                  <td>{s.user.characterName}</td>
                  <td className="text-right">{noah(s.held)}</td>
                  <td className="text-right text-gold">{noah(s.share)}</td>
                  <td className={`text-right ${s.balance > 0n ? "text-red-300" : s.balance < 0n ? "text-green-300" : "text-mute"}`}>
                    {s.balance > 0n ? `${noah(s.balance)} verecek` : s.balance < 0n ? `${noah(-s.balance)} alacak` : "tamam"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={collectorMode ? "contents" : "space-y-6"}>
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
          <div className="card">
            <h2 className="mb-2 font-semibold">Hesaba giren kayıtlar ({st.loot.length})</h2>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {st.loot.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span>
                    {l.itemName}{l.plusLevel !== null ? ` +${l.plusLevel}` : ""}{l.quantity > 1 ? ` ×${l.quantity}` : ""}{" "}
                    <span className="text-xs text-mute">({lootStatusLabel[l.status]})</span>
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
