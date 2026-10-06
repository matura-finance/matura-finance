import { redirect } from "next/navigation";

// The docs tree is the whole site; send the root straight to the docs index.
export default function Home() {
  redirect("/docs");
}
