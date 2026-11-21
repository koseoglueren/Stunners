import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { categoryLabel, classLabel, durationText, hoursBetween, lootStatusLabel, noah, noahShort } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { lootContribution } from "@/lib/settlement";
import { Badge, Empty, MemberLink, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { DateTimeInput, LocalTime, SubmitButton } from "@/components/client";
import { LootForm } from "../LootForm";
import { MemberPicker } from "../MemberPicker";
import {
  addLoot,
  deleteLoot,
  deleteSession,
  finishSession,
  giveLoot,
  reopenSession,
  restockLoot,
  sellLoot,
  updateSession,
} from "../actions";

const statusTone = { COIN: "gold", IN_STOCK: "orange", SOLD: "green", GIVEN: "gray" } as const;

export default async function FarmPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const s = await prisma.farmSession.findUnique({
    where: { id },
    include: {
      location: true,
      createdBy: true,
      members: { include: { user: true }, orderBy: { user: { characterName: "asc" } } },
      loot: { include: { holder: true, soldBy: true, receiver: true }, orderBy: { droppedAt: "desc" } },
      settlements: { include: { settlement: true } },
    },
  });
  if (!s) notFound();

  const officer = hasRole(me, "OFFICER");
  const isMember = s.members.some((m) => m.userId === me.id);
  const locked = s.settlements.length > 0;
  const canAddLoot = officer && !locked;
    const [items, allMembers, locations] = await Promise.all([
    prisma.itemCatalog.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { characterName: "asc" } }),
    prisma.farmLocation.findMany({ orderBy: { name: "asc" } }),
  ]);

  const coin = s.loot.filter((l) => l.status === "COIN").reduce((a, l) => a + l.value, 0n);
  const sold = s.loot.filter((l) => l.status === "SOLD").reduce((a, l) => a + (l.salePrice ?? 0n), 0n);
  const given = s.loot.filter((l) => l.status === "GIVEN").reduce((a, l) => a + l.value, 0n);
  const stock = s.loot.filter((l) => l.status === "IN_STOCK");
  const stockValue = stock.reduce((a, l) => a + l.value, 0n);
  const earned = coin + sold + given;
  const n = BigInt(Math.max(1, s.members.length));
  const hours = hoursBetween(s.startAt, s.endAt);
  const memberOpts = s.members.map((m) => ({ id: m.userId, name: m.user.characterName }));
  const allOpts = allMembers.map((m) => ({ id: m.id, name: m.characterName }));
  const unsettledLoot = s.loot.filter((l) => !l.settlementId && lootContribution(l));

  return (
    <>
      <PageHeader
        title={`${s.location.name}${s.title ? ` · ${s.title}` : ""}`}
        subtitle={
          <>
            <LocalTime value={s.startAt} /> → {s.endAt ? <LocalTime value={s.endAt} mode="time" /> : "devam ediyor"} · {durationText(s.startAt, s.endAt)} · Açan: {s.createdBy.characterName}
          </>
        }
        actions={
          <>
            <Link href="/farms" className="btn-ghost">← Farmlar</Link>
            {s.status === "FINISHED" && officer && unsettledLoot.length > 0 && (
              <Link href={`/settlements/new?oturum=${s.id}`} className="btn-primary">Gün sonu hesabı yap</Link>
            )}
          </>
        }
      />
      <Flash sp={sp} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Toplam kazanç" value={noahShort(earned)} hint={`${noah(earned)} Noah`} accent />
        <Stat label="Coin" value={noahShort(coin)} />
        <Stat label="Item satış + dağıtılan" value={noahShort(sold + given)} />
        <Stat label="Satılmayan (tahmini)" value={noahShort(stockValue)} hint={`${stock.length} kayıt`} />
        <Stat
          label="Kişi başı (şimdilik)"
          value={noahShort(earned / n)}
          hint={hours > 0 ? `${noahShort(Number(earned) / hours)} / saat` : undefined}
        />
      </div>

      {s.status === "ACTIVE" && officer && (
        <form action={finishSession.bind(null, s.id)} className="card mb-6 flex flex-wrap items-end gap-3 border-good/40">
          <div>
            <div className="mb-1 font-semibold text-green-300">Farm devam ediyor</div>
            <label className="label">Bitiş saati</label>
            <DateTimeInput name="endAt" defaultValue={new Date().toISOString()} />
          </div>
          <SubmitButton>Farmı bitir</SubmitButton>
        </form>
      )}
      {locked && (
        <div className="card mb-6 border-gold/40 text-sm">
          Bu farm şu hesaplara dahil:{" "}
          {s.settlements.map((x, i) => (
            <span key={x.settlementId}>
              {i > 0 && ", "}
              <Link href={`/settlements/${x.settlementId}`} className="text-gold hover:underline">{x.settlement.title}</Link>
            </span>
          ))}
          . Hesaplanmış loot kilitlidir. Sonradan satılan itemler için yeni bir hesap (ek hesap) yapılabilir.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card xl:col-span-1">
          <h2 className="mb-3 font-semibold">Ekip ({s.members.length} kişi)</h2>
          <ul className="space-y-1 text-sm">
            {s.members.map((m) => (
              <li key={m.userId} className="flex justify-between">
                <MemberLink user={m.user} />
                <span className="text-mute">{m.user.charClass ? classLabel[m.user.charClass] : ""}</span>
              </li>
            ))}
          </ul>
          {officer && !locked && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gold">Ekibi ve saatleri düzenle</summary>
              <form action={updateSession.bind(null, s.id)} className="mt-3 space-y-3">
                <div>
                  <label className="label">Farm yeri</label>
                  <select name="locationId" className="input" defaultValue={s.locationId}>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Parti adı</label>
                  <input name="title" className="input" defaultValue={s.title ?? ""} />
                </div>
                <div>
                  <label className="label">Başlangıç</label>
                  <DateTimeInput name="startAt" defaultValue={s.startAt.toISOString()} />
                </div>
                {s.endAt && (
                  <div>
                    <label className="label">Bitiş</label>
                    <DateTimeInput name="endAt" defaultValue={s.endAt.toISOString()} />
                  </div>
                )}
                <MemberPicker members={allOpts} selected={s.members.map((m) => m.userId)} />
                <input type="hidden" name="note" value={s.note ?? ""} />
                <SubmitButton>Kaydet</SubmitButton>
              </form>
            </details>
          )}
          {officer && s.status === "FINISHED" && !locked && (
            <form action={reopenSession.bind(null, s.id)} className="mt-3">
              <SubmitButton className="btn-ghost btn-sm">Farmı tekrar aç</SubmitButton>
            </form>
          )}
          {hasRole(me, "LEADER") && !locked && (
            <form action={deleteSession.bind(null, s.id)} className="mt-3">
              <SubmitButton className="btn-danger btn-sm" confirm="Farm ve tüm loot kayıtları silinsin mi?">Farmı sil</SubmitButton>
            </form>
          )}
          {s.note && <p className="mt-4 text-sm text-mute">Not: {s.note}</p>}
        </div>

        <div className="space-y-6 xl:col-span-2">
          {canAddLoot && (
            <div className="card">
              <h2 className="mb-3 font-semibold">Loot / coin ekle</h2>
              <LootForm
                action={addLoot.bind(null, s.id)}
                items={items.map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.defaultPrice.toString() }))}
                members={memberOpts}
                defaultHolder={isMember ? me.id : (memberOpts[0]?.id ?? "")}
              />
              <p className="mt-2 text-xs text-mute">Miktarları 150m, 1,5b, 250k veya 150.000.000 şeklinde yazabilirsin.</p>
            </div>
          )}

          <div className="card p-0" id="loot">
            <h2 className="px-5 pt-5 font-semibold">Düşenler ({s.loot.length})</h2>
            {s.loot.length === 0 ? (
              <div className="p-5"><Empty>Henüz kayıt yok.</Empty></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table mt-2">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Kimde</th>
                      <th className="text-right">Değer</th>
                      <th>Durum</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.loot.map((l) => {
                      const editable = officer && !l.settlementId;
                      return (
                        <tr key={l.id}>
                          <td>
                            <div className="font-medium">
                              {l.itemName}
                              {l.plusLevel !== null && <span className="text-gold"> +{l.plusLevel}</span>}
                              {l.quantity > 1 && <span className="text-mute"> ×{l.quantity}</span>}
                            </div>
                            <div className="text-xs text-mute">
                              {categoryLabel[l.category]} · <LocalTime value={l.droppedAt} mode="time" />
                              {l.note && ` · ${l.note}`}
                            </div>
                          </td>
                          <td className="text-sm">
                            {l.status === "SOLD" ? (
                              <>Satan: {l.soldBy?.characterName ?? l.holder.characterName}</>
                            ) : l.status === "GIVEN" ? (
                              <>Alan: {l.receiver?.characterName}</>
                            ) : (
                              l.holder.characterName
                            )}
                          </td>
                          <td className="text-right whitespace-nowrap">
                            {l.status === "SOLD" ? (
                              <span className="text-green-300">{noah(l.salePrice)}</span>
                            ) : l.status === "IN_STOCK" ? (
                              <span className="text-mute">~{noah(l.value)}</span>
                            ) : (
                              <span className="text-gold">{noah(l.value)}</span>
                            )}
                          </td>
                          <td>
                            <Badge tone={statusTone[l.status]}>{lootStatusLabel[l.status]}</Badge>
                            {l.settlementId && <div className="mt-1 text-xs text-mute">hesaplandı</div>}
                          </td>
                          <td className="text-right">
                            {editable && (
                              <details className="relative inline-block text-left">
                                <summary className="btn-ghost btn-sm cursor-pointer list-none">İşlem</summary>
                                <div className="absolute right-0 z-20 mt-1 w-72 space-y-3 rounded-lg border border-line bg-panel-2 p-3 shadow-xl">
                                  {l.status !== "COIN" && (
                                    <form action={sellLoot.bind(null, l.id)} className="space-y-2">
                                      <div className="text-xs font-semibold text-mute uppercase">Satıldı</div>
                                      <input name="salePrice" className="input" placeholder="Satış fiyatı (örn. 45m)" defaultValue={l.salePrice ? noah(l.salePrice) : ""} required />
                                      <select name="soldById" className="input" defaultValue={l.soldById ?? l.holderId}>
                                        {allOpts.map((m) => (
                                          <option key={m.id} value={m.id}>Satan: {m.name}</option>
                                        ))}
                                      </select>
                                      <SubmitButton className="btn-primary btn-sm w-full">Satışı kaydet</SubmitButton>
                                    </form>
                                  )}
                                  {l.status !== "COIN" && (
                                    <form action={giveLoot.bind(null, l.id)} className="space-y-2 border-t border-line pt-3">
                                      <div className="text-xs font-semibold text-mute uppercase">Üyeye ver (payından düşülür)</div>
                                      <select name="receiverId" className="input" defaultValue={l.receiverId ?? ""}>
                                        <option value="" disabled>Alan üye</option>
                                        {memberOpts.map((m) => (
                                          <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                      </select>
                                      <input name="value" className="input" placeholder="Değeri" defaultValue={noah(l.value)} required />
                                      <SubmitButton className="btn-ghost btn-sm w-full">Üyeye ver</SubmitButton>
                                    </form>
                                  )}
                                  <div className="flex gap-2 border-t border-line pt-3">
                                    {(l.status === "SOLD" || l.status === "GIVEN") && (
                                      <form action={restockLoot.bind(null, l.id)}>
                                        <SubmitButton className="btn-ghost btn-sm">Satılmadı yap</SubmitButton>
                                      </form>
                                    )}
                                    <form action={deleteLoot.bind(null, l.id)}>
                                      <SubmitButton className="btn-danger btn-sm" confirm="Kayıt silinsin mi?">Sil</SubmitButton>
                                    </form>
                                  </div>
                                </div>
                              </details>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
