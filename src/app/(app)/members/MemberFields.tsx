import type { User } from "@prisma/client";
import { classLabel, roleLabel } from "@/lib/format";

export function MemberFields({ user }: { user?: User }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label">Karakter adı</label>
        <input name="characterName" className="input" defaultValue={user?.characterName} required />
      </div>
      <div>
        <label className="label">Rol</label>
        <select name="role" className="input" defaultValue={user?.role ?? "MEMBER"}>
          {Object.entries(roleLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Sınıf</label>
        <select name="charClass" className="input" defaultValue={user?.charClass ?? ""}>
          <option value="">Seç</option>
          {Object.entries(classLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Seviye</label>
        <input name="level" type="number" min={1} max={99} className="input" defaultValue={user?.level ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Not</label>
        <input name="note" className="input" defaultValue={user?.note ?? ""} placeholder="Örn. discord adı" />
      </div>
    </div>
  );
}
