import { Alert } from "./ui";
import { first } from "@/lib/forms";

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const err = first(sp.hata);
  const ok = first(sp.tamam);
  return (
    <>
      {err && <Alert>{err}</Alert>}
      {ok && <Alert tone="green">{ok}</Alert>}
    </>
  );
}
