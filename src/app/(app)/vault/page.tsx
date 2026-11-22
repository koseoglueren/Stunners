import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { getTreasurer } from "@/lib/clan";
import { categoryLabel, noah, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { allocate } from "@/lib/settlement";
import { itemOwners } from "@/lib/shares";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ActionMenu, LocalTime, SubmitButton } from "@/components/client";
import { setTransferStatus } from "../settlements/actions";
import { addVaultItem, deleteLoot, resetLootOwners, sellLoot, sellMany, setLootOwners, setLootVault, updateLootValue } from "../farms/actions";
import { setTreasurer } from "./actions";
import { VaultForm } from "./VaultForm";

export const metadata = { title: "Clan kasası" };

const sessionInclude = {
  location: true,
  members: { include: { user: true }, orderBy: { user: { characterName: "asc" as const } } },
} as const;

function ItemName({ l }: { l: { itemName: string; plusLevel: number | null; quantity: number } }) {
  return (
    <>
      {l.itemName}
      {l.plusLevel !== null && <span className="text-gold"> +{l.plusLevel}</span>}
      {l.quantity > 1 && <span className="text-mute"> ×{l.quantity}</span>}
    </>
  );
}

export default async function VaultPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const officer = hasRole(me, "OFFICER");
  const mine = first(sp.benim) === "1";

  const [allDeliveries, treasurer, vaultAll, farmStock, soldWaiting, payouts, deliveries, users, items, farms] = await Promise.all([
    prisma.transfer.findMany({ where: { kind: "DELIVERY" }, select: { fromId: true, amount: true, status: true } }),
    getTreasurer(),
    prisma.lootEntry.findMany({
      where: { status: "IN_STOCK", inVault: true },
      include: { holder: true, owners: true, session: { include: sessionInclude } },
      orderBy: [{ vaultAt: "desc" }, { droppedAt: "desc" }],
    }),
    officer
      ? prisma.lootEntry.findMany({
          where: { status: "IN_STOCK", inVault: false, sessionId: { not: null } },
          include: { holder: true, handedOverBy: true, session: { include: { location: true } } },
          orderBy: { droppedAt: "desc" },
        })
      : [],
    prisma.lootEntry.findMany({
      where: { status: "SOLD", settlementId: null, sessionId: { not: null } },
      include: { soldBy: true, holder: true, owners: true, session: { include: sessionInclude } },
      orderBy: { soldAt: "desc" },
    }),
    prisma.transfer.findMany({ where: { kind: "PAYOUT" }, select: { toId: true, amount: true, status: true } }),
    prisma.transfer.findMany({
      where: { kind: "DELIVERY" },
      include: { from: true, settlement: { select: { id: true, title: true, lockedAt: true } } },
      orderBy: [{ settlement: { createdAt: "desc" } }, { amount: "desc" }],
      take: 60,
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { characterName: "asc" } }),
    officer ? prisma.itemCatalog.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    officer
      ? prisma.farmSession.findMany({ include: { location: true, _count: { select: { members: true } } }, orderBy: { startAt: "desc" }, take: 40 })
      : [],
  ]);

  const nameOf = new Map(users.map((u) => [u.id, u.characterName]));
  const name = (id: string) => nameOf.get(id) ?? "?";
  const ownersOf = (l: (typeof vaultAll)[number] | (typeof soldWaiting)[number]) => itemOwners(l, l.session);
  const vault = mine ? vaultAll.filter((l) => ownersOf(l).includes(me.id)) : vaultAll;
  const itemTotal = vaultAll.reduce((a, l) => a + l.value, 0n);

  // clan coin: what the vault account holds for each member (payouts not done yet)
  const bal = new Map<string, { pending: bigint; paid: bigint; delivered: bigint }>();
  const row = (id: string) => bal.get(id) ?? bal.set(id, { pending: 0n, paid: 0n, delivered: 0n }).get(id)!;
  for (const p of payouts) {
    if (p.status === "RECEIVED") row(p.toId).paid += p.amount;
    else row(p.toId).pending += p.amount;
  }
  // sold but not distributed yet: each owner's part
  const soldParts = soldWaiting.map((l) => ({ l, parts: allocate(l.salePrice ?? 0n, ownersOf(l).map((userId) => ({ userId, weight: 1n }))) }));
  const soldByMember = new Map<string, bigint>();
  for (const { parts } of soldParts) for (const [id, v] of parts) soldByMember.set(id, (soldByMember.get(id) ?? 0n) + v);
  const toDeliver = new Map<string, bigint>();
  for (const d of allDeliveries) {
    if (d.status === "RECEIVED") row(d.fromId).delivered += d.amount;
    else toDeliver.set(d.fromId, (toDeliver.get(d.fromId) ?? 0n) + d.amount);
  }
  const clanCoin = [...bal.values()].reduce((a, b) => a + b.pending, 0n);
  const soldTotal = soldWaiting.reduce((a, l) => a + (l.salePrice ?? 0n), 0n);
  const deliveryPending = [...toDeliver.values()].reduce((a, v) => a + v, 0n);
  const soldSessions = [...new Set(soldWaiting.map((l) => l.sessionId).filter((x): x is string => !!x))];
  const myPending = bal.get(me.id)?.pending ?? 0n;
  const balanceRows = [...new Set([...bal.keys(), ...soldByMember.keys(), ...toDeliver.keys()])]
    .map((id) => ({ id, ...(bal.get(id) ?? { pending: 0n, paid: 0n, delivered: 0n }), sold: soldByMember.get(id) ?? 0n, owes: toDeliver.get(id) ?? 0n }))
    .filter((r) => r.pending || r.paid || r.sold || r.owes)
    .sort((a, b) => (b.pending + b.sold > a.pending + a.sold ? 1 : -1));

  const allOpts = users.map((m) => ({ id: m.id, name: m.characterName }));
  const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" });
  const farmOpts = farms.map((f) => ({
    id: f.id,
    name: `${dateFmt.format(f.startAt)} · ${f.location.name}${f.title ? ` · ${f.title}` : ""} (${f._count.members} kişi)`,
  }));

  return (
    <>
      <PageHeader
        title="Clan kasası"
        subtitle={
          <>
            Kasa hesabı: <b className="text-gold">{treasurer?.characterName ?? "seçilmedi"}</b>. Farm sonrası herkes elindeki Noah ve itemleri bu hesaba teslim eder, kasa herkese payını öder.
          </>
        }
      />
      <Flash sp={sp} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clan coini" value={noahShort(clanCoin)} hint="Üyelerin kasadaki alacaklarının toplamı" accent />
        <Stat label="Senin kasadaki alacağın" value={noahShort(myPending + (soldByMember.get(me.id) ?? 0n))} hint={<Link href="/payim" className="text-gold">Detay →</Link>} />
        <Stat label="Kasadaki itemler (tahmini)" value={noahShort(itemTotal)} hint={`${vaultAll.length} item`} />
        <Stat label="Satıldı, dağıtım bekliyor" value={noahShort(soldTotal)} hint={`${soldWaiting.length} item`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="card p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
              <h2 className="font-semibold">Kasadaki itemler ({vault.length})</h2>
              <div className="flex gap-2 text-sm">
                <Link href="/vault" className={mine ? "btn-ghost btn-sm" : "btn-primary btn-sm"}>Hepsi</Link>
                <Link href="/vault?benim=1" className={mine ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Payım olanlar</Link>
              </div>
            </div>
            {vault.length === 0 ? (
              <div className="p-5"><Empty>{mine ? "Kasada payın olan item yok." : "Kasada item yok."}</Empty></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table mt-2">
                  <thead>
                    <tr>
                      {officer && <th className="w-8"></th>}
                      <th>Item</th>
                      <th>Pay sahipleri</th>
                      <th className="text-right">Tahmini</th>
                      {officer && <th>Satış fiyatı</th>}
                      {officer && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {vault.map((l) => {
                      const owners = ownersOf(l);
                      const iOwn = owners.includes(me.id);
                      const per = owners.length ? l.value / BigInt(owners.length) : 0n;
                      const choices = [...new Set([...(l.session?.members.map((m) => m.userId) ?? []), ...owners])];
                      return (
                        <tr key={l.id}>
                          {officer && (
                            <td>
                              <input type="checkbox" name="sel" value={l.id} form="bulk-sell" className="h-4 w-4 accent-gold" aria-label="Satılanlara ekle" />
                            </td>
                          )}
                          <td>
                            <div className="font-medium"><ItemName l={l} /></div>
                            <div className="text-xs text-mute">
                              {categoryLabel[l.category]} · {l.holder.characterName} hesabında
                              {l.session && (
                                <>
                                  {" · "}
                                  <Link href={`/farms/${l.sessionId}#pazar`} className="hover:text-gold">{l.session.location.name}</Link>{" "}
                                  <LocalTime value={l.session.startAt} mode="date" />
                                </>
                              )}
                              {l.note && ` · ${l.note}`}
                            </div>
                          </td>
                          <td className="text-sm">
                            {iOwn && <Badge tone="gold">Payın var</Badge>}{" "}
                            <span className="text-xs text-mute">{owners.length} kişi{l.customOwners ? " (düzenlendi)" : ""}:</span>
                            <div className="max-w-72 text-xs text-mute">{owners.map(name).join(", ")}</div>
                          </td>
                          <td className="text-right whitespace-nowrap">
                            ~{noah(l.value)}
                            <div className="text-xs text-mute">kişi başı ~{noahShort(per)}</div>
                          </td>
                          {officer && (
                            <td>
                              <input name={`price_${l.id}`} form="bulk-sell" className="input w-28" placeholder="örn. 45m" />
                            </td>
                          )}
                          {officer && (
                            <td className="text-right">
                              <ActionMenu title={`${l.itemName}${l.plusLevel !== null ? ` +${l.plusLevel}` : ""}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`}>
                                  <form action={sellLoot.bind(null, l.id)} className="space-y-2">
                                    <input type="hidden" name="back" value="/vault" />
                                    <div className="text-xs font-semibold text-mute uppercase">Pazarda satıldı</div>
                                    <input name="salePrice" className="input" placeholder="Satış fiyatı (örn. 45m)" required />
                                    <select name="soldById" className="input" defaultValue={l.holderId}>
                                      {allOpts.map((m) => (
                                        <option key={m.id} value={m.id}>Satan: {m.name}</option>
                                      ))}
                                    </select>
                                    <p className="text-xs text-mute">Satış parası {owners.length} pay sahibine eşit bölünür.</p>
                                    <SubmitButton className="btn-primary btn-sm w-full">Satışı kaydet</SubmitButton>
                                  </form>
                                  <form action={setLootOwners.bind(null, l.id)} className="space-y-2 border-t border-line pt-3">
                                    <input type="hidden" name="back" value="/vault" />
                                    <div className="text-xs font-semibold text-mute uppercase">Pay sahipleri</div>
                                    <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
                                      {choices.map((id) => (
                                        <label key={id} className="flex items-center gap-2">
                                          <input type="checkbox" name="ownerIds" value={id} defaultChecked={owners.includes(id)} className="accent-gold" />
                                          {name(id)}
                                        </label>
                                      ))}
                                    </div>
                                    <SubmitButton className="btn-ghost btn-sm w-full">Pay sahiplerini kaydet</SubmitButton>
                                  </form>
                                  {l.customOwners && (
                                    <form action={resetLootOwners.bind(null, l.id, "/vault")}>
                                      <SubmitButton className="btn-ghost btn-sm w-full">Varsayılana dön (farm ekibi)</SubmitButton>
                                    </form>
                                  )}
                                  <form action={updateLootValue.bind(null, l.id)} className="flex gap-2 border-t border-line pt-3">
                                    <input type="hidden" name="back" value="/vault" />
                                    <input name="value" className="input" defaultValue={noah(l.value)} aria-label="Tahmini değer" />
                                    <SubmitButton className="btn-ghost btn-sm">Değer</SubmitButton>
                                  </form>
                                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                                    {l.sessionId && (
                                      <form action={setLootVault.bind(null, l.id, false, "/vault")}>
                                        <SubmitButton className="btn-ghost btn-sm">Kasadan çıkar</SubmitButton>
                                      </form>
                                    )}
                                    <form action={deleteLoot.bind(null, l.id, "/vault")}>
                                      <SubmitButton className="btn-danger btn-sm" confirm="Kayıt tamamen silinsin mi?">Sil</SubmitButton>
                                    </form>
                                  </div>
                              </ActionMenu>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {officer && vault.length > 0 && (
              <form id="bulk-sell" action={sellMany} className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4">
                <div className="text-sm text-mute sm:flex-1">Satılan itemleri işaretle, her birinin satış fiyatını yaz, sonra kaydet. Para her itemin kendi pay sahiplerine bölünür.</div>
                <select name="soldById" className="input w-auto" defaultValue={treasurer?.id ?? me.id}>
                  {allOpts.map((m) => (
                    <option key={m.id} value={m.id}>Satan: {m.name}</option>
                  ))}
                </select>
                <SubmitButton>Seçilenleri satıldı kaydet</SubmitButton>
              </form>
            )}
          </div>

          {soldWaiting.length > 0 && (
            <div className="card">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Satıldı, dağıtım bekliyor</h2>
                {officer && soldSessions.length > 0 && (
                  <Link href={`/settlements/new?${soldSessions.map((id) => `oturum=${id}`).join("&")}`} className="btn-primary btn-sm">
                    Hepsini dağıt
                  </Link>
                )}
              </div>
              <p className="mb-3 text-sm text-mute">Satış parası itemin pay sahiplerine eşit bölünür. Dağıtım, o farm için yapılan gün sonu hesabıyla (gerekirse ek hesapla) kayda geçer.</p>
              <ul className="divide-y divide-line text-sm">
                {soldParts.map(({ l, parts }) => (
                  <li key={l.id} className="py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <b><ItemName l={l} /></b>
                        <span className="text-mute"> · {l.session?.location.name} · satan {l.soldBy?.characterName ?? l.holder.characterName}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-green-300">{noah(l.salePrice)}</span>
                        {officer && l.sessionId && (
                          <Link href={`/settlements/new?oturum=${l.sessionId}`} className="btn-primary btn-sm">Dağıtımı yap</Link>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-mute">
                      {[...parts].map(([id, v]) => (
                        <span key={id} className={id === me.id ? "text-gold" : ""}>
                          {name(id)}: {noahShort(v)}{"  "}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-0">
            <h2 className="px-5 pt-5 font-semibold">Kasaya teslimler (kim ne yatırdı)</h2>
            <p className="px-5 text-sm text-mute">Gün sonu hesaplarından çıkan, üyelerin kasa hesabına teslim etmesi gereken Noah. Bekleyen: {noah(deliveryPending)}</p>
            {deliveries.length === 0 ? (
              <div className="p-5"><Empty>Henüz teslim kaydı yok.</Empty></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table mt-2">
                  <thead>
                    <tr>
                      <th>Üye</th>
                      <th>Hesap</th>
                      <th className="text-right">Tutar</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.id}>
                        <td className={d.fromId === me.id ? "text-gold" : ""}>{d.from.characterName}</td>
                        <td className="text-sm">
                          <Link href={`/settlements/${d.settlement.id}`} className="hover:text-gold">{d.settlement.title}</Link>
                        </td>
                        <td className="text-right">{noah(d.amount)}</td>
                        <td>
                          {d.status === "RECEIVED" ? <Badge tone="green">Teslim edildi</Badge> : <Badge tone="orange">Bekliyor</Badge>}
                          {officer && (
                            <form action={setTransferStatus.bind(null, d.id, d.status === "RECEIVED" ? "PENDING" : "RECEIVED", "/vault")} className="mt-1">
                              <SubmitButton className="btn-ghost btn-sm">{d.status === "RECEIVED" ? "Geri al" : "Teslim aldım"}</SubmitButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {officer && farmStock.length > 0 && (
            <div className="card p-0">
              <h2 className="px-5 pt-5 font-semibold">Farmlarda satılmamış, kasaya eklenmemiş ({farmStock.length})</h2>
              <div className="overflow-x-auto">
                <table className="table mt-2">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Farm</th>
                      <th>Kimden geldi</th>
                      <th>Şu an kimde</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {farmStock.map((l) => (
                      <tr key={l.id}>
                        <td><ItemName l={l} /></td>
                        <td className="text-sm">
                          <Link href={`/farms/${l.sessionId}#loot`} className="hover:text-gold">{l.session!.location.name}</Link>{" "}
                          <span className="text-xs text-mute"><LocalTime value={l.droppedAt} mode="date" /></span>
                        </td>
                        <td className="text-sm">{(l.handedOverBy ?? l.holder).characterName}</td>
                        <td className="text-sm">{l.holder.characterName}</td>
                        <td className="text-right">
                          <form action={setLootVault.bind(null, l.id, true, "/vault")}>
                            <SubmitButton className="btn-ghost btn-sm">Kasaya ekle</SubmitButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-0">
            <h2 className="px-5 pt-5 font-semibold">Üyelerin kasadaki alacakları</h2>
            <p className="px-5 text-xs text-mute">Ödeme bekliyor: kasanın üyeye ödemesi gereken. Ödendi: kasanın ödediği. Kasaya teslim edecek: üyenin elindeki farm parası.</p>
            {balanceRows.length === 0 ? (
              <div className="p-5"><Empty>Henüz hesap yok.</Empty></div>
            ) : (
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>Üye</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceRows.map((r) => (
                    <tr key={r.id} className={r.id === me.id ? "bg-gold/5" : ""}>
                      <td className={r.id === me.id ? "text-gold" : ""}>{name(r.id)}</td>
                      <td className="space-y-1 text-sm">
                        {r.owes > 0n && <div><Badge tone="red">Kasaya teslim edecek</Badge> <span className="whitespace-nowrap">{noahShort(r.owes)}</span></div>}
                        {r.pending > 0n && <div><Badge tone="orange">Ödeme bekliyor</Badge> <span className="whitespace-nowrap">{noahShort(r.pending)}</span></div>}
                        {r.sold > 0n && <div><Badge tone="gold">Satıştan gelecek</Badge> <span className="whitespace-nowrap">{noahShort(r.sold)}</span></div>}
                        {r.paid > 0n && <div><Badge tone="green">Ödendi</Badge> <span className="whitespace-nowrap text-mute">{noahShort(r.paid)}</span></div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {officer && (
            <form action={setTreasurer} className="card space-y-2">
              <h2 className="font-semibold">Kasa hesabı</h2>
              <p className="text-sm text-mute">Clan kasası olarak kullanılan oyuncu. Gün sonu hesaplarında teslim alan üye varsayılan olarak bu olur.</p>
              <select name="userId" className="input" defaultValue={treasurer?.id ?? ""}>
                {allOpts.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <SubmitButton className="btn-ghost btn-sm">Kaydet</SubmitButton>
            </form>
          )}

          {officer ? (
            <div className="card">
              <h2 className="mb-3 font-semibold">Kasaya elle item ekle</h2>
              <VaultForm
                action={addVaultItem}
                items={items.filter((i) => i.category !== "COIN").map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.defaultPrice.toString() }))}
                members={allOpts}
                farms={farmOpts}
                defaultHolder={treasurer?.id ?? me.id}
              />
            </div>
          ) : (
            <div className="card text-sm text-mute">Kasayı sadece yöneticiler düzenleyebilir.</div>
          )}
        </div>
      </div>
    </>
  );
}
