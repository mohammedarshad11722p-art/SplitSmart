// Location: frontend/app/not-found.tsx
import Link from "next/link";
import { CenteredMessage, PageShell } from "@/components/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <CenteredMessage emoji="🧾" title="Page not found">
        <Link href="/" className="font-semibold text-ink underline decoration-line decoration-2 underline-offset-4">
          Back to SplitSmart
        </Link>
      </CenteredMessage>
    </PageShell>
  );
}
