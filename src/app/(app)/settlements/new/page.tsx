import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { durationText, lootStatusLabel, noah, noahShort } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { buildSettlementPreview } from "@/lib/settlement-data";
import { Alert, Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { LocalTime, SubmitButton } from "@/components/client";
import { createSettlement } from "../actions";

export const metadata = { title: "Gün sonu hesabı" };

export default async function NewSettlementPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("OFFICER");
  const sp = await searchParams;
  const selected = [sp.oturum].flat().filter((x): x is string => !!x);

  // candidate sessions: anything with loot not yet settled, plus selected ones
  const candidates = await prisma.farmSession.findMany({
    where: {
      OR: [
        { id: { in: selected } },
        { loot: { some: { settlementId: null, status: { in: ["COIN", "SOLD", "GIVEN"] } } } },
      ],
    },
    include: { location: true, _count: { select: { members: true } } },
    orderBy: { startAt: "desc" },
    take: 60,
  });
  const preview = selected.length ? await buildSettlementPreview(selected) : null;
  const name = (id: string) => preview?.users.get(id)?.characterName ?? "?";

  return (
    <>
      <PageHeader
        title="Gün sonu hesabı"
        subtitle="Hesaba katılacak farmları seç. Birden fazla parti seçersen hepsinin kazancı birleşir ve tüm katılımcılara eşit bölünür."
        actions={<Link href="/settlements" className="btn-ghost">← Hesaplar</Link>}
      />
      <Flash sp={sp} />
      <form className="card mb-6" method="get">
        <h2 className="mb-3 font-semibold">1. Farmları seç</h2>
        {candidates.length === 0 ? (
          <Empty>Hesaplanmayı bekleyen farm yok.</Empty>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {candidates.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2 text-sm hover:border-gold/50">
                <input type="checkbox" name="oturum" value={s.id} defaultChecked={selected.includes(s.id)} className="accent-[#d4a64a]" />
                <span className="font-medium">{s.location.name}{s.title ? ` · ${s.title}` : ""}</span>
                <span className="text-mute"><LocalTime value={s.startAt} /> · {durationText(s.startAt, s.endAt)} · {s._count.members} kişi</span>
                {s.status === "ACTIVE" && <Badge tone="green">devam ediyor</Badge>}
              </label>
            ))}
          </div>
        )}
        <button className="btn-ghost mt-4">Hesabı göster</button>
      </form>

      {preview && (
        <>
          <h2 className="mb-3 font-semibold">2. Önizleme</h2>
          {preview.active.length > 0 && <Alert>Seçilenlerden {preview.active.length} farm hâlâ devam ediyor. Kilitlemeden önce farmı bitir.</Alert>}
          {preview.unsold.length > 0 && (
            <Alert tone="gold">
              {preview.unsold.length} item henüz satılmadı (tahmini {noahShort(preview.unsold.reduce((a, l) => a + l.value, 0n))}). Bu hesaba girmezler;
              satıldıklarında aynı farmlar için yeni bir ek hesap yapabilirsin.
            </Alert>
          )}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Toplam" value={noahShort(preview.total)} hint={`${noah(preview.total)} Noah`} accent />
            <Stat label="Kişi sayısı" value={new Set(preview.sessions.flatMap((x) => x.members.map((m) => m.userId))).size} />
            <Stat label="Kişi başı" value={noahShort(preview.perShare)} hint={`${noah(preview.perShare)} Noah`} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="card overflow-x-auto p-0">
              <h3 className="px-5 pt-5 font-semibold">Pay tablosu</h3>
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>Üye</th>
                    <th className="text-right">Elinde olan</th>
                    <th className="text-right">Payı</th>
                    <th className="text-right">Fark</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.shares.map((s) => (
                    <tr key={s.userId}>
                      <td>{name(s.userId)}</td>
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
            <div className="card">
              <h3 className="mb-2 font-semibold">Kim kime ne verecek ({preview.transfers.length} işlem)</h3>
              {preview.transfers.length === 0 ? (
                <Empty>Transfer gerekmiyor.</Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {preview.transfers.map((t, i) => (
                    <li key={i} className="flex justify-between rounded-lg border border-line bg-bg px-3 py-2">
                      <span>
                        <b>{name(t.fromId)}</b> → <b>{name(t.toId)}</b>
                      </span>
                      <span className="text-gold">{noah(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mt-6 mb-2 font-semibold">Hesaba giren kayıtlar ({preview.included.length})</h3>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {preview.included.map(({ loot, amount }) => (
                  <li key={loot.id} className="flex justify-between">
                    <span>
                      {loot.itemName}{loot.plusLevel !== null ? ` +${loot.plusLevel}` : ""}{loot.quantity > 1 ? ` ×${loot.quantity}` : ""}{" "}
                      <span className="text-xs text-mute">({lootStatusLabel[loot.status]})</span>
                    </span>
                    <span>{noah(amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <form action={createSettlement} className="card mt-6 flex flex-wrap items-end gap-3">
            {selected.map((id) => (
              <input key={id} type="hidden" name="sessionIds" value={id} />
            ))}
            <div className="min-w-64 flex-1">
              <label className="label">Hesap adı</label>
              <input
                name="title"
                className="input"
                defaultValue={`Gün sonu ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`}
              />
            </div>
            <SubmitButton confirm="Hesap kilitlensin mi? Kilitlenen kayıtlar değiştirilemez.">3. Hesabı kilitle ve ödemeleri oluştur</SubmitButton>
          </form>
        </>
      )}
    </>
  );
}
