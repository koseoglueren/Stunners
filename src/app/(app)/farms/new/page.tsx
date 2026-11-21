import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { classLabel } from "@/lib/format";
import type { SearchParams } from "@/lib/forms";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { DateTimeInput, SubmitButton } from "@/components/client";
import { MemberPicker } from "../MemberPicker";
import { createSession } from "../actions";

export const metadata = { title: "Yeni farm" };

export default async function NewFarmPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("OFFICER");
  const sp = await searchParams;
  const [locations, members] = await Promise.all([
    prisma.farmLocation.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { characterName: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Yeni farm başlat" actions={<Link href="/farms" className="btn-ghost">← Farmlar</Link>} />
      <Flash sp={sp} />
      <form action={createSession} className="card space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Farm yeri</label>
            <select name="locationId" className="input" required defaultValue="">
              <option value="" disabled>Seç</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Başlangıç</label>
            <DateTimeInput name="startAt" defaultValue={new Date().toISOString()} required />
          </div>
          <div>
            <label className="label">Parti adı (isteğe bağlı)</label>
            <input name="title" className="input" placeholder="örn. 1. Parti" />
          </div>
        </div>
        <div>
          <label className="label">Ekip</label>
          <MemberPicker members={members.map((m) => ({ id: m.id, name: m.characterName, cls: m.charClass ? classLabel[m.charClass] : null }))} />
        </div>
        <div>
          <label className="label">Not</label>
          <input name="note" className="input" placeholder="isteğe bağlı" />
        </div>
        <SubmitButton>Farmı başlat</SubmitButton>
      </form>
    </>
  );
}
