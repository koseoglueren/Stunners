import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { SearchParams } from "@/lib/forms";
import { Badge, PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { LocalTime, SubmitButton } from "@/components/client";
import { createLocation, toggleLocation } from "./actions";

export const metadata = { title: "Ayarlar" };

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("LEADER");
  const sp = await searchParams;
  const [locations, logs] = await Promise.all([
    prisma.farmLocation.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { sessions: true } } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: true } }),
  ]);
  return (
    <>
      <PageHeader title="Ayarlar" subtitle="Paylaşım kuralı: kesinti yok, seçilen farmların toplam kazancı tüm katılımcılara eşit bölünür." />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Farm yerleri</h2>
          <form action={createLocation} className="mb-4 flex gap-2">
            <input name="name" className="input" placeholder="Yeni farm yeri" required />
            <SubmitButton>Ekle</SubmitButton>
          </form>
          <ul className="space-y-1 text-sm">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <span className={l.active ? "" : "text-mute line-through"}>{l.name} <span className="text-xs text-mute">({l._count.sessions} farm)</span></span>
                <form action={toggleLocation.bind(null, l.id)}>
                  <SubmitButton className="btn-ghost btn-sm">{l.active ? "Gizle" : "Göster"}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
        <div className="card overflow-x-auto p-0">
          <h2 className="px-5 pt-5 font-semibold">İşlem geçmişi (son 100)</h2>
          <table className="table mt-2">
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs text-mute"><LocalTime value={l.createdAt} /></td>
                  <td className="text-sm">{l.user?.characterName ?? "-"}</td>
                  <td><Badge tone={l.action.includes("delete") || l.action === "login_failed" ? "red" : "gray"}>{l.action}</Badge></td>
                  <td className="max-w-64 truncate text-xs text-mute" title={l.detail ?? ""}>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
