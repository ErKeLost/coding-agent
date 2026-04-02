import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RootPage() {
  const id = `thread-${randomUUID()}`;
  redirect(`/${id}`);
}
