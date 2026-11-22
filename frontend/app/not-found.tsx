// Location: frontend/app/not-found.tsx
import Link from "next/link";
import { CenteredMessage, PageShell } from "@/components/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <CenteredMessage emoji="🧾" title="Page not found">
        <Link href="/" className="font-semibold text-orange-600 underline">
          Back to SplitSmart
        </Link>
      </CenteredMessage>
    </PageShell>
  );
}
