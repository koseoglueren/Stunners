import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { categoryLabel, classLabel, durationText, hoursBetween, lootStatusLabel, noah, noahShort } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { allocate, lootContribution } from "@/lib/settlement";
import { itemOwners, lootBeneficiaries, presence } from "@/lib/shares";
import { Badge, Empty, MemberLink, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ActionMenu, DateTimeInput, LocalTime, SubmitButton, NoahInput } from "@/components/client";
import { LootForm } from "../LootForm";
import { CollectForm } from "../CollectForm";
import { MemberPicker } from "../MemberPicker";
import {
  addLoot,
  addPartyMember,
  collectFromMember,
  deleteLoot,
  deleteSession,
  finishSession,
  reopenSession,
  resetLootOwners,
  restockLoot,
  sellLoot,
  setLootOwners,
  setLootVault,
  setMemberTimes,
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
      loot: { include: { holder: true, soldBy: true, receiver: true, owners: true }, orderBy: { droppedAt: "desc" } },
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
  const nameOf = new Map(allMembers.map((m) => [m.id, m.characterName]));
  const outsiders = allMembers.filter((m) => !s.members.some((x) => x.userId === m.id));
  // estimated share of everything counted so far (coin by time present, sold items by owners)
  const estimate = new Map<string, bigint>();
  for (const l of s.loot) {
    const c = lootContribution(l);
    if (!c) continue;
    for (const [id, part] of allocate(c.amount, lootBeneficiaries(l, s))) estimate.set(id, (estimate.get(id) ?? 0n) + part);
  }
  const ownersOf = (l: (typeof s.loot)[number]) => itemOwners(l, s);
  // what was received from each member (coin + items they brought)
  const fromWhom = (l: (typeof s.loot)[number]) => l.handedOverById ?? l.holderId;
  const received = s.members.map((m) => {
    const mine = s.loot.filter((l) => fromWhom(l) === m.userId);
    const coinIn = mine.filter((l) => l.status === "COIN").reduce((a, l) => a + l.value, 0n);
    const itemsIn = mine.filter((l) => l.status !== "COIN");
    return { m, coinIn, itemsIn, done: mine.length > 0 };
  });
  const totalItems = new Map<string, number>();
  for (const l of s.loot.filter((x) => x.status !== "COIN")) {
    const k = `${l.itemName}${l.plusLevel !== null ? ` +${l.plusLevel}` : ""}`;
    totalItems.set(k, (totalItems.get(k) ?? 0) + l.quantity);
  }
  const nextMember = received.find((r) => !r.done)?.m.userId ?? s.members[0]?.userId ?? "";
  const allOpts = allMembers.map((m) => ({ id: m.id, name: m.characterName }));
  const unsettledLoot = s.loot.filter((l) => !l.settlementId && lootContribution(l));
  const vaultItems = stock.filter((l) => l.inVault);
  const vaultValue = vaultItems.reduce((a, l) => a + l.value, 0n);
  const pazarMap = new Map<string, { label: string; qty: number; value: bigint; owners: number[] }>();
  for (const l of vaultItems) {
    const label = `${l.itemName}${l.plusLevel !== null ? ` +${l.plusLevel}` : ""}`;
    const g = pazarMap.get(label) ?? { label, qty: 0, value: 0n, owners: [] };
    g.qty += l.quantity;
    g.value += l.value;
    const n = ownersOf(l).length;
    if (!g.owners.includes(n)) g.owners.push(n);
    pazarMap.set(label, g);
  }
  const pazarGroups = [...pazarMap.values()].sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label, "tr"));
  const soldWaiting = s.loot.filter((l) => l.status === "SOLD" && !l.settlementId);
  const soldWaitingTotal = soldWaiting.reduce((a, l) => a + (l.salePrice ?? 0n), 0n);

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
          label="Ortalama pay (şimdilik)"
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
          <ul className="divide-y divide-line text-sm">
            {s.members.map((m) => {
              const p = presence(m, s);
              const late = m.joinedAt && m.joinedAt > s.startAt;
              const early = m.leftAt && (!s.endAt || m.leftAt < s.endAt);
              return (
                <li key={m.userId} className="py-1.5">
                  <div className="flex justify-between gap-2">
                    <span>
                      <MemberLink user={m.user} />{" "}
                      <span className="text-xs text-mute">{m.user.charClass ? classLabel[m.user.charClass] : ""}</span>
                    </span>
                    <span className="text-gold" title="Şu ana kadarki tahmini payı">{noahShort(estimate.get(m.userId) ?? 0n)}</span>
                  </div>
                  <div className={`text-xs ${late || early ? "text-orange-300" : "text-mute"}`}>
                    Başlangıç: <LocalTime value={p.from} /> · Bitiş: {s.endAt || early ? <LocalTime value={p.to} /> : "devam ediyor"} · {durationText(p.from, p.to)}
                  </div>
                  {officer && !locked && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-mute hover:text-gold">Saatleri düzenle</summary>
                      <form action={setMemberTimes.bind(null, s.id, m.userId)} className="mt-2 space-y-2">
                        <div>
                          <label className="label">Başlangıç saati</label>
                          <DateTimeInput name="joinedAt" defaultValue={p.from.toISOString()} />
                        </div>
                        <div>
                          <label className="label">Bitiş saati {s.endAt ? "" : "(boş = farm bitince)"}</label>
                          <DateTimeInput name="leftAt" defaultValue={s.endAt || m.leftAt ? p.to.toISOString() : ""} />
                        </div>
                        <SubmitButton className="btn-ghost btn-sm">Kaydet</SubmitButton>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-mute">Coin, farmda geçirilen süreye göre bölünür. Item, düştüğü anda partide olanlara eşit bölünür.</p>
          {officer && !locked && outsiders.length > 0 && (
            <form action={addPartyMember.bind(null, s.id)} className="mt-4 space-y-2 rounded-lg border border-line bg-bg p-3">
              <div className="text-sm font-semibold">Partiye sonradan katılan</div>
              <select name="userId" className="input" defaultValue="" required>
                <option value="" disabled>Üye seç</option>
                {outsiders.map((u) => (
                  <option key={u.id} value={u.id}>{u.characterName}</option>
                ))}
              </select>
              <div>
                <label className="label">Katıldığı saat</label>
                <DateTimeInput name="joinedAt" defaultValue={new Date().toISOString()} />
              </div>
              <SubmitButton className="btn-primary btn-sm w-full">Partiye ekle</SubmitButton>
            </form>
          )}
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
            <div className="card" id="teslim">
              <h2 className="mb-1 font-semibold">Üyeden teslim al</h2>
              <p className="mb-3 text-sm text-mute">
                Üyeyi seç, ondan aldığın coini ve itemleri yaz, kaydet. Sıradaki üye otomatik seçilir. ({received.filter((r) => r.done).length}/{received.length} üye tamam)
              </p>
              <CollectForm
                action={collectFromMember.bind(null, s.id)}
                members={received.map((r) => ({ id: r.m.userId, name: r.m.user.characterName, done: r.done }))}
                items={items.filter((i) => i.category !== "COIN").map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.defaultPrice.toString() }))}
                defaultMember={nextMember}
              />
              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm text-mute hover:text-gold">Tek tek kayıt ekle (düşme saatiyle)</summary>
                <div className="mt-3">
                  <LootForm
                    action={addLoot.bind(null, s.id)}
                    items={items.map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.defaultPrice.toString() }))}
                    members={memberOpts}
                    defaultHolder={isMember ? me.id : (memberOpts[0]?.id ?? "")}
                    coinDone={[...new Set(s.loot.filter((l) => l.status === "COIN").map((l) => l.handedOverById ?? l.holderId))]}
                  />
                </div>
              </details>
              <p className="mt-2 text-xs text-mute">Miktarları 150m, 1,5b, 250k veya 150.000.000 şeklinde yazabilirsin.</p>
            </div>
          )}

          <div className="card p-0">
            <h2 className="px-5 pt-5 font-semibold">Üye bazında teslim alınanlar</h2>
            <div className="overflow-x-auto">
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>Üye</th>
                    <th className="text-right">Coin</th>
                    <th>Itemler</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {received.map((r) => (
                    <tr key={r.m.userId}>
                      <td>{r.m.user.characterName}</td>
                      <td className="text-right text-gold whitespace-nowrap">{r.coinIn ? noah(r.coinIn) : "-"}</td>
                      <td className="text-sm">
                        {r.itemsIn.length
                          ? r.itemsIn.map((l) => `${l.itemName}${l.plusLevel !== null ? ` +${l.plusLevel}` : ""}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`).join(", ")
                          : <span className="text-mute">-</span>}
                      </td>
                      <td>{r.done ? <Badge tone="green">Alındı</Badge> : <Badge tone="orange">Bekliyor</Badge>}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td>Farm toplamı</td>
                    <td className="text-right text-gold whitespace-nowrap">{noah(coin)}</td>
                    <td className="text-sm font-normal">
                      {totalItems.size ? [...totalItems].map(([k, q]) => `${k}${q > 1 ? ` ×${q}` : ""}`).join(", ") : <span className="text-mute">-</span>}
                    </td>
                    <td className="text-sm font-normal text-mute">{received.filter((r) => r.done).length}/{received.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {(vaultItems.length > 0 || (locked && soldWaiting.length > 0)) && (
            <div className="card border-warn/40" id="pazar">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Pazarda satılmayı bekleyenler ({vaultItems.reduce((a, l) => a + l.quantity, 0)} adet)</h2>
                <Link href="/vault" className="text-sm text-gold hover:underline">Clan kasası →</Link>
              </div>
              <p className="mb-3 text-sm text-mute">
                Bu itemler <b className="text-ink">bu farmın ekibine</b> aittir: <span className="text-ink">{s.members.map((m) => m.user.characterName).join(", ")}</span>.
                Satıldığında para itemin pay sahipleri arasında eşit dağıtılır (sonradan katılan, katılmadan önce düşen itemlerde pay sahibi değildir).
              </p>
              {vaultItems.length > 0 && (
                <ul className="divide-y divide-line text-sm">
                  {pazarGroups.map((g) => (
                    <li key={g.label} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {g.label} <b className="text-gold">{g.qty} Adet</b>
                        <span className="text-xs text-mute"> · pay: {g.owners.join(" / ")} kişi</span>
                      </span>
                      <span className="text-mute">~{noah(g.value)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between py-2 font-medium">
                    <span>Tahmini toplam</span>
                    <span>~{noah(vaultValue)}</span>
                  </li>
                </ul>
              )}
              {soldWaiting.length > 0 && (
                <div className="mt-3 rounded-lg border border-good/40 bg-good/10 p-3 text-sm">
                  <b>{soldWaiting.length} item satıldı, dağıtım bekliyor</b> ({noah(soldWaitingTotal)} Noah).{" "}
                  {locked
                    ? "Bu farmın hesabı daha önce yapıldığı için satış parası ek hesapla dağıtılır."
                    : "Gün sonu hesabına otomatik girer."}
                  {locked && officer && (
                    <div className="mt-2">
                      <Link href={`/settlements/new?oturum=${s.id}`} className="btn-primary btn-sm">Ek hesap yap</Link>
                    </div>
                  )}
                </div>
              )}
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
                            {l.status !== "COIN" && (
                              <div className="text-xs text-mute" title={ownersOf(l).map((id) => nameOf.get(id) ?? "?").join(", ")}>
                                Pay sahibi: {l.customOwners ? ownersOf(l).map((id) => nameOf.get(id) ?? "?").join(", ") : `${ownersOf(l).length} kişi (ekip)`}
                              </div>
                            )}
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
                            {l.status === "IN_STOCK" && l.inVault ? (
                              <Badge tone="orange">Kasada · satış bekliyor</Badge>
                            ) : (
                              <Badge tone={statusTone[l.status]}>{lootStatusLabel[l.status]}</Badge>
                            )}
                            {l.settlementId && <div className="mt-1 text-xs text-mute">hesaplandı</div>}
                          </td>
                          <td className="text-right">
                            {editable && (
                              <ActionMenu title={`${l.itemName}${l.plusLevel !== null ? ` +${l.plusLevel}` : ""}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`}>
                                  {l.status !== "COIN" && (
                                    <form action={sellLoot.bind(null, l.id)} className="space-y-2">
                                      <div className="text-xs font-semibold text-mute uppercase">Satıldı</div>
                                      <NoahInput name="salePrice" className="input" placeholder="Satış fiyatı (örn. 45m)" defaultValue={l.salePrice ? noah(l.salePrice) : ""} required />
                                      <select name="soldById" className="input" defaultValue={l.soldById ?? l.holderId}>
                                        {allOpts.map((m) => (
                                          <option key={m.id} value={m.id}>Satan: {m.name}</option>
                                        ))}
                                      </select>
                                      <SubmitButton className="btn-primary btn-sm w-full">Satışı kaydet</SubmitButton>
                                    </form>
                                  )}
                                  {l.status !== "COIN" && (
                                    <form action={setLootOwners.bind(null, l.id)} className="space-y-2 border-t border-line pt-3">
                                      <div className="text-xs font-semibold text-mute uppercase">Pay sahipleri</div>
                                      <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
                                        {[...new Set([...memberOpts.map((m) => m.id), ...ownersOf(l)])].map((id) => (
                                          <label key={id} className="flex items-center gap-2">
                                            <input type="checkbox" name="ownerIds" value={id} defaultChecked={ownersOf(l).includes(id)} className="accent-gold" />
                                            {nameOf.get(id) ?? "?"}
                                          </label>
                                        ))}
                                      </div>
                                      <SubmitButton className="btn-ghost btn-sm w-full">Pay sahiplerini kaydet</SubmitButton>
                                    </form>
                                  )}
                                  {l.customOwners && (
                                    <form action={resetLootOwners.bind(null, l.id, undefined)}>
                                      <SubmitButton className="btn-ghost btn-sm w-full">Varsayılana dön (ekip)</SubmitButton>
                                    </form>
                                  )}
                                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                                    {l.status === "IN_STOCK" && (
                                      <form action={setLootVault.bind(null, l.id, !l.inVault, undefined)}>
                                        <SubmitButton className="btn-ghost btn-sm">{l.inVault ? "Kasadan çıkar" : "Clan kasasına ekle"}</SubmitButton>
                                      </form>
                                    )}
                                    {(l.status === "SOLD" || l.status === "GIVEN") && (
                                      <form action={restockLoot.bind(null, l.id, undefined)}>
                                        <SubmitButton className="btn-ghost btn-sm">Satılmadı yap</SubmitButton>
                                      </form>
                                    )}
                                    <form action={deleteLoot.bind(null, l.id, undefined)}>
                                      <SubmitButton className="btn-danger btn-sm" confirm="Kayıt silinsin mi?">Sil</SubmitButton>
                                    </form>
                                  </div>
                                </ActionMenu>
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
