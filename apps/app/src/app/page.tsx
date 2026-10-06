import { redirect } from "next/navigation";

// The app has no standalone home — Vaults is the public landing surface.
export default function HomePage() {
  redirect("/vaults");
}
