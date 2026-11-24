import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { getTreasurer } from "@/lib/clan";
import { noah, noahShort } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { allocate } from "@/lib/settlement";
import { itemOwners } from "@/lib/shares";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ActionMenu, LocalTime, SubmitButton, NoahInput } from "@/components/client";
import { addVaultItem, deleteLoot, resetLootOwners, setLootOwners, setLootVault, updateLootValue } from "../farms/actions";
import { vaultKey } from "@/lib/vault-sale";
import { sellVaultGroup, setTreasurer } from "./actions";
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

  const [treasurer, vaultAll, farmStock, soldWaiting, payouts, users, items, farms, itemFarms] = await Promise.all([
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
    prisma.user.findMany({ where: { active: true }, orderBy: { characterName: "asc" } }),
    officer ? prisma.itemCatalog.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    officer
      ? prisma.farmSession.findMany({ include: { location: true, _count: { select: { members: true } } }, orderBy: { startAt: "desc" }, take: 40 })
      : [],
    prisma.farmSession.findMany({
      where: { loot: { some: { status: { not: "COIN" } } } },
      include: {
        location: true,
        members: true,
        loot: { where: { status: { not: "COIN" } }, include: { owners: true }, orderBy: { droppedAt: "asc" } },
      },
      orderBy: { startAt: "desc" },
      take: 30,
    }),
  ]);

  const nameOf = new Map(users.map((u) => [u.id, u.characterName]));
  const name = (id: string) => nameOf.get(id) ?? "?";
  const ownersOf = (l: (typeof vaultAll)[number] | (typeof soldWaiting)[number]) => itemOwners(l, l.session);
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
  const clanCoin = [...bal.values()].reduce((a, b) => a + b.pending, 0n);
  const soldTotal = soldWaiting.reduce((a, l) => a + (l.salePrice ?? 0n), 0n);
  const soldSessions = [...new Set(soldWaiting.map((l) => l.sessionId).filter((x): x is string => !!x))];
  const myPending = bal.get(me.id)?.pending ?? 0n;
  const balanceRows = [...new Set([...bal.keys(), ...soldByMember.keys()])]
    .map((id) => ({ id, ...(bal.get(id) ?? { pending: 0n, paid: 0n, delivered: 0n }), sold: soldByMember.get(id) ?? 0n }))
    .filter((r) => r.pending || r.paid || r.sold)
    .sort((a, b) => (b.pending + b.sold > a.pending + a.sold ? 1 : -1));

  // vault items grouped by name + plus level: "Mirage Dagger — 20 Adet"
  type Group = { key: string; label: string; qty: number; value: bigint; mine: number; entries: typeof vaultAll };
  const groupMap = new Map<string, Group>();
  for (const l of vaultAll) {
    const key = vaultKey(l);
    const g = groupMap.get(key) ?? { key, label: `${l.itemName}${l.plusLevel !== null ? ` +${l.plusLevel}` : ""}`, qty: 0, value: 0n, mine: 0, entries: [] };
    g.qty += l.quantity;
    g.value += l.value;
    if (ownersOf(l).includes(me.id)) g.mine += l.quantity;
    g.entries.push(l);
    groupMap.set(key, g);
  }
  // oldest farm first, the order units are sold in
  for (const g of groupMap.values()) g.entries.sort((a, b) => a.droppedAt.getTime() - b.droppedAt.getTime());
  const groups = [...groupMap.values()].sort((a, b) => a.label.localeCompare(b.label, "tr"));
  const shownGroups = mine ? groups.filter((g) => g.mine > 0) : groups;

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
            Kasa hesabı: <b className="text-gold">{treasurer?.characterName ?? "seçilmedi"}</b>. Farmda toplanan Noah ve itemler bu hesaba alınır, kasa herkese payını öder.
          </>
        }
      />
      <Flash sp={sp} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clan coini" value={noahShort(clanCoin)} hint="Üyelerin kasadaki alacaklarının toplamı" accent />
        <Stat label="Senin kasadaki alacağın" value={noahShort(myPending + (soldByMember.get(me.id) ?? 0n))} hint={<Link href="/payim" className="text-gold">Detay →</Link>} />
        <Stat label="Kasadaki itemler (tahmini)" value={noahShort(itemTotal)} hint={`${vaultAll.reduce((a, l) => a + l.quantity, 0)} adet`} />
        <Stat label="Satıldı, dağıtım bekliyor" value={noahShort(soldTotal)} hint={`${soldWaiting.length} item`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="card overflow-x-auto p-0">
            <h2 className="px-5 pt-5 font-semibold">Farmlara göre itemler</h2>
            <p className="px-5 text-xs text-mute">Bir farmın itemlerini görmek için &quot;Itemler&quot; butonuna bas.</p>
            {itemFarms.length === 0 ? (
              <div className="p-5"><Empty>Item düşen farm yok.</Empty></div>
            ) : (
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>Farm tarihi</th>
                    <th>Farm yeri</th>
                    <th className="text-right">Item</th>
                    <th className="hidden text-right sm:table-cell">Satıldı</th>
                    <th className="hidden text-right sm:table-cell">Satış toplamı</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {itemFarms.map((f) => {
                    const qty = f.loot.reduce((a, l) => a + l.quantity, 0);
                    const sold = f.loot.filter((l) => l.status === "SOLD");
                    const soldQty = sold.reduce((a, l) => a + l.quantity, 0);
                    const soldSum = sold.reduce((a, l) => a + (l.salePrice ?? 0n), 0n);
                    const fname = `${f.location.name}${f.title ? ` · ${f.title}` : ""}`;
                    return (
                      <tr key={f.id}>
                        <td className="whitespace-nowrap"><LocalTime value={f.startAt} mode="date" /></td>
                        <td><Link href={`/farms/${f.id}`} className="hover:text-gold">{fname}</Link></td>
                        <td className="text-right">{qty}</td>
                        <td className="hidden text-right sm:table-cell">{soldQty > 0 ? <span className="text-green-300">{soldQty}</span> : <span className="text-mute">0</span>}</td>
                        <td className="hidden text-right text-gold sm:table-cell">{soldSum > 0n ? noahShort(soldSum) : "-"}</td>
                        <td className="text-right">
                          <ActionMenu title={<>{fname} · <LocalTime value={f.startAt} mode="date" /></>} label="Itemler" wide>
                            <div className="overflow-x-auto">
                              <table className="table text-sm">
                                <thead>
                                  <tr>
                                    <th>Item</th>
                                    <th className="text-right">Adet</th>
                                    <th className="text-right">Satış fiyatı</th>
                                    <th>Durum</th>
                                    <th className="text-right">Pay</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {f.loot.map((l) => {
                                    const owners = itemOwners(l, f);
                                    return (
                                      <tr key={l.id}>
                                        <td>{l.itemName}{l.plusLevel !== null && <span className="text-gold"> +{l.plusLevel}</span>}</td>
                                        <td className="text-right">{l.quantity}</td>
                                        <td className="whitespace-nowrap text-right">{l.status === "SOLD" ? <span className="text-green-300">{noah(l.salePrice)}</span> : <span className="text-mute">~{noahShort(l.value)}</span>}</td>
                                        <td>
                                          {l.status === "SOLD" ? <Badge tone="green">Satıldı</Badge> : l.status === "GIVEN" ? <Badge>Verildi</Badge> : l.inVault ? <Badge tone="orange">Kasada, satılmadı</Badge> : <Badge>Satılmadı</Badge>}
                                        </td>
                                        <td className="whitespace-nowrap text-right" title={owners.map(name).join(", ")}>{owners.length} kişi{owners.includes(me.id) && <span className="text-gold"> · sen</span>}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </ActionMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="card p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
              <h2 className="font-semibold">Kasadaki itemler ({groups.reduce((a, g) => a + g.qty, 0)} adet)</h2>
              <div className="flex gap-2 text-sm">
                <Link href="/vault" className={mine ? "btn-ghost btn-sm" : "btn-primary btn-sm"}>Hepsi</Link>
                <Link href="/vault?benim=1" className={mine ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Payım olanlar</Link>
              </div>
            </div>
            <p className="px-5 text-xs text-mute">
              Satılmayı bekleyen itemler, aynı item tek satırda. Kimin payı olduğunu görmek için iteme tıkla.
              {officer && " Satarken kaç adet sattığını ve toplam fiyatı yaz; kalan adet kasada kalır. Satılan adetler en eski farmdan başlayarak düşülür, para o farmın pay sahiplerine bölünür."}
            </p>
            {shownGroups.length === 0 ? (
              <div className="p-5"><Empty>{mine ? "Kasada payın olan item yok." : "Kasada item yok."}</Empty></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table mt-2">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Kalan</th>
                      <th className="text-right">Tahmini</th>
                      {officer && <th>Satış (adet · toplam fiyat)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {shownGroups.map((g) => (
                      <tr key={g.key}>
                        <td>
                          <ActionMenu title={`${g.label} · ${g.qty} Adet`} label={g.label} buttonClassName="text-left hover:text-gold underline decoration-dotted underline-offset-4" wide>
                            <ul className="divide-y divide-line text-sm">
                              {g.entries.map((l) => {
                                const owners = ownersOf(l);
                                const choices = [...new Set([...(l.session?.members.map((m) => m.userId) ?? []), ...owners])];
                                return (
                                  <li key={l.id} className="py-2">
                                    <div className="flex flex-wrap justify-between gap-2">
                                      <span>
                                        <b>{l.quantity} Adet</b>
                                        {l.session ? (
                                          <span className="text-mute"> · <Link href={`/farms/${l.sessionId}#pazar`} className="hover:text-gold">{l.session.location.name}{l.session.title ? ` · ${l.session.title}` : ""}</Link> · <LocalTime value={l.session.startAt} mode="date" /></span>
                                        ) : (
                                          <span className="text-mute"> · elle eklendi</span>
                                        )}
                                      </span>
                                      <span className="text-mute">~{noahShort(l.value)} · {owners.length} kişiye pay{l.customOwners ? " (düzenlendi)" : ""}</span>
                                    </div>
                                    <div className="mt-1 text-xs text-mute">
                                      {l.holder.characterName} hesabında{l.note && ` · ${l.note}`} ·{" "}
                                      {owners.map((id) => (
                                        <span key={id} className={id === me.id ? "text-gold" : ""}>{name(id)}{"  "}</span>
                                      ))}
                                    </div>
                                    {officer && (
                                      <details className="mt-2">
                                        <summary className="cursor-pointer text-xs text-gold">Bu kaydı düzenle</summary>
                                        <div className="mt-2 space-y-3">
                                          <form action={setLootOwners.bind(null, l.id)} className="space-y-2">
                                            <input type="hidden" name="back" value="/vault" />
                                            <div className="text-xs font-semibold text-mute uppercase">Pay sahipleri</div>
                                            <div className="max-h-40 space-y-1 overflow-y-auto">
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
                                            <NoahInput name="value" className="input" defaultValue={noah(l.value)} aria-label="Tahmini değer" />
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
                                        </div>
                                      </details>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </ActionMenu>
                          {g.mine > 0 && <span className="ml-2"><Badge tone="gold">Payın var</Badge></span>}
                          {new Set(g.entries.map((e) => e.sessionId)).size > 1 && <div className="text-xs text-mute">{new Set(g.entries.map((e) => e.sessionId)).size} farmdan</div>}
                        </td>
                        <td className="whitespace-nowrap text-right text-gold">{g.qty} Adet</td>
                        <td className="whitespace-nowrap text-right text-mute">~{noahShort(g.value)}</td>
                        {officer && (
                          <td>
                            <form action={sellVaultGroup} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="key" value={g.key} />
                              <input type="hidden" name="soldById" value={treasurer?.id ?? me.id} />
                              <input type="number" name="qty" min={1} max={g.qty} defaultValue={g.qty} required className="input w-20" aria-label="Satılan adet" />
                              <NoahInput name="salePrice" className="input w-32" placeholder="örn. 45000" required aria-label="Toplam satış fiyatı" />
                              <SubmitButton className="btn-primary btn-sm">Sat</SubmitButton>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            <p className="px-5 text-xs text-mute">Ödeme bekliyor: kasanın üyeye ödemesi gereken. Satıştan gelecek: satılan itemlerden payı. Ödendi: kasanın ödediği.</p>
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
              <p className="text-sm text-mute">Clan kasası olarak kullanılan oyuncu. Üyelerden toplanan coin ve itemler bu hesaba yazılır.</p>
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
