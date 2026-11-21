import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { classLabel, noahShort, roleLabel } from "@/lib/format";
import { first, type SearchParams } from "@/lib/forms";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";

export const metadata = { title: "Üyeler" };

export default async function MembersPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const show = first(sp.durum) ?? "aktif";
  const users = await prisma.user.findMany({
    where: {
      ...(show === "aktif" ? { active: true } : show === "pasif" ? { active: false } : {}),
      ...(q ? { OR: [{ characterName: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ role: "asc" }, { characterName: "asc" }],
    include: { _count: { select: { memberships: true } } },
  });
  const earnings = await prisma.settlementShare.groupBy({ by: ["userId"], _sum: { share: true } });
  const earn = new Map(earnings.map((e) => [e.userId, e._sum.share ?? 0n]));

  return (
    <>
      <PageHeader
        title="Üyeler"
        subtitle={`${users.length} üye listeleniyor`}
        actions={hasRole(me, "LEADER") && <Link href="/members/new" className="btn-primary">+ Üye ekle</Link>}
      />
      <Flash sp={sp} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Karakter veya kullanıcı adı ara" className="input max-w-xs" />
        <select name="durum" defaultValue={show} className="input w-auto">
          <option value="aktif">Aktif</option>
          <option value="pasif">Pasif</option>
          <option value="hepsi">Hepsi</option>
        </select>
        <button className="btn-ghost">Filtrele</button>
      </form>
      <div className="card overflow-x-auto p-0">
        {users.length === 0 ? (
          <div className="p-5"><Empty>Üye bulunamadı.</Empty></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Karakter</th>
                <th>Kullanıcı adı</th>
                <th>Sınıf</th>
                <th>Seviye</th>
                <th>Rol</th>
                <th className="text-right">Farm</th>
                <th className="text-right">Toplam kazanç</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-panel-2/60">
                  <td><Link href={`/members/${u.id}`} className="font-medium hover:text-gold">{u.characterName}</Link></td>
                  <td className="text-mute">@{u.username}</td>
                  <td>{u.charClass ? classLabel[u.charClass] : "-"}</td>
                  <td>{u.level ?? "-"}</td>
                  <td><Badge tone={u.role === "LEADER" ? "gold" : u.role === "OFFICER" ? "orange" : "gray"}>{roleLabel[u.role]}</Badge></td>
                  <td className="text-right">{u._count.memberships}</td>
                  <td className="text-right text-gold">{noahShort(earn.get(u.id) ?? 0n)}</td>
                  <td>{u.active ? <Badge tone="green">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
