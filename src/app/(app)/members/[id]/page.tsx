import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth";
import { classLabel, durationText, noah, noahShort, roleLabel } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { LocalTime, SubmitButton } from "@/components/client";
import { MemberFields } from "../MemberFields";
import { resetPassword, setMemberActive, updateMember } from "../actions";

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  const isLeader = hasRole(me, "LEADER");

  const [memberships, shares, pendingOut, pendingIn] = await Promise.all([
    prisma.sessionMember.findMany({
      where: { userId: id },
      include: { session: { include: { location: true } } },
      orderBy: { session: { startAt: "desc" } },
      take: 15,
    }),
    prisma.settlementShare.findMany({
      where: { userId: id },
      include: { settlement: true },
      orderBy: { settlement: { createdAt: "desc" } },
    }),
    prisma.transfer.aggregate({ where: { fromId: id, status: "PENDING" }, _sum: { amount: true } }),
    prisma.transfer.aggregate({ where: { toId: id, status: { not: "RECEIVED" } }, _sum: { amount: true } }),
  ]);
  const total = shares.reduce((a, s) => a + s.share, 0n);
  const totalSessions = await prisma.sessionMember.count({ where: { userId: id } });

  return (
    <>
      <PageHeader
        title={user.characterName}
        subtitle={
          <>
            @{user.username} · {roleLabel[user.role]} · {user.charClass ? classLabel[user.charClass] : "Sınıf yok"}
            {user.level ? ` · Lv ${user.level}` : ""} {!user.active && <Badge>Pasif</Badge>}
          </>
        }
        actions={
          <>
            <Link href="/members" className="btn-ghost">← Üyeler</Link>
            {(me.id === user.id || hasRole(me, "OFFICER")) && (
              <Link href={me.id === user.id ? "/payim" : `/payim?uye=${user.id}`} className="btn-primary">Payını gör</Link>
            )}
          </>
        }
      />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Toplam kazanç" value={noahShort(total)} hint={`${noah(total)} Noah`} accent />
        <Stat label="Katıldığı farm" value={totalSessions} />
        <Stat label="Vermesi gereken" value={noahShort(pendingOut._sum.amount ?? 0n)} />
        <Stat label="Alacağı" value={noahShort(pendingIn._sum.amount ?? 0n)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Son farmlar</h2>
          {memberships.length === 0 ? (
            <Empty>Henüz farm yok.</Empty>
          ) : (
            <table className="table">
              <tbody>
                {memberships.map(({ session: s }) => (
                  <tr key={s.id}>
                    <td><Link href={`/farms/${s.id}`} className="hover:text-gold">{s.location.name}</Link></td>
                    <td className="text-mute"><LocalTime value={s.startAt} /></td>
                    <td className="text-right text-mute">{durationText(s.startAt, s.endAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Hesaplardan payları</h2>
          {shares.length === 0 ? (
            <Empty>Henüz kilitlenmiş hesap yok.</Empty>
          ) : (
            <table className="table">
              <tbody>
                {shares.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/settlements/${s.settlementId}`} className="hover:text-gold">{s.settlement.title}</Link></td>
                    <td className="text-mute"><LocalTime value={s.settlement.createdAt} mode="date" /></td>
                    <td className="text-right text-gold">{noah(s.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isLeader && (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <form action={updateMember.bind(null, user.id)} className="card space-y-4 xl:col-span-2">
            <h2 className="font-semibold">Bilgileri düzenle</h2>
            <MemberFields user={user} />
            <SubmitButton>Kaydet</SubmitButton>
          </form>
          <div className="space-y-6">
            <form action={resetPassword.bind(null, user.id)} className="card space-y-3">
              <h2 className="font-semibold">Şifre sıfırla</h2>
              <input name="password" className="input" placeholder="Yeni şifre" minLength={6} required />
              <SubmitButton className="btn-ghost">Şifreyi değiştir</SubmitButton>
            </form>
            {user.id !== me.id && (
              <form action={setMemberActive.bind(null, user.id, !user.active)} className="card space-y-3">
                <h2 className="font-semibold">{user.active ? "Clandan çıkar" : "Tekrar aktif et"}</h2>
                <p className="text-sm text-mute">
                  {user.active
                    ? "Üye pasife alınır, giriş yapamaz. Geçmiş farm ve paylaşım kayıtları silinmez."
                    : "Üye tekrar giriş yapabilir ve farmlara eklenebilir."}
                </p>
                <SubmitButton className={user.active ? "btn-danger" : "btn-ghost"} confirm={user.active ? "Üye pasife alınsın mı?" : undefined}>
                  {user.active ? "Pasife al" : "Aktif et"}
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
