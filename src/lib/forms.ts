import { redirect } from "next/navigation";

export function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}hata=${encodeURIComponent(message)}`);
}

export function done(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}tamam=${encodeURIComponent(message)}`);
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function str(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
