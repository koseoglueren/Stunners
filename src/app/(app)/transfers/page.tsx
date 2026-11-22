import { redirect } from "next/navigation";

// Ödemeler sayfası kaldırıldı: ödemeler gün sonu hesabında ve "Payım" sayfasında görünür.
export default function TransfersPage() {
  redirect("/payim");
}
