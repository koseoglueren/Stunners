import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { durationText, lootStatusLabel, noah, noahShort } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { lootContribution } from "@/lib/settlement";
import { PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { LocalTime, SubmitButton } from "@/components/client";
import { TransferTable } from "@/components/TransferTable";
import { deleteSettlement } from "../actions";

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
    },
  });
  if (!st) notFound();
  const shares = [...st.shares].sort((a, b) =>
    a.user.characterName.localeCompare(b.user.characterName, "tr"),
  );
  const path = `/settlements/${id}`;

  return (
    <>
      <PageHeader
        title={st.title}
        subtitle={<>Kilitleyen: {st.createdBy.characterName} · <LocalTime value={st.lockedAt ?? st.createdAt} /></>}
        actions={<Link href="/settlements" className="btn-ghost">← Hesaplar</Link>}
      />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Toplam" value={noahShort(st.total)} hint={`${noah(st.total)} Noah`} accent />
        <Stat label="Kişi başı" value={noahShort(st.perShare)} hint={`${noah(st.perShare)} Noah${st.remainder > 0n ? ` (+1 Noah ${st.remainder} kişiye)` : ""}`} />
        <Stat label="Katılımcı" value={shares.filter((s) => s.share > 0n).length} />
      </div>

      <div className="card mb-6 p-0">
        <h2 className="px-5 pt-5 font-semibold">Kim kime ne verecek</h2>
        {st.transfers.length === 0 ? (
          <p className="p-5 text-sm text-mute">Transfer gerekmiyor.</p>
        ) : (
          <TransferTable transfers={st.transfers} me={me.id} officer={hasRole(me, "OFFICER")} backTo={path} />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card overflow-x-auto p-0">
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
        <div className="space-y-6">
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
