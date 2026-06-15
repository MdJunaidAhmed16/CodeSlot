"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PlanCtaKind } from "@/lib/content";

/** Pricing CTA. Self-serve plans drop the advertiser on the New Campaign form;
 *  the Custom plan routes to Contact (sales). */
export function PlanCta({
  label,
  kind,
  highlight,
}: {
  label: string;
  kind: PlanCtaKind;
  highlight: boolean;
}) {
  const router = useRouter();

  function go() {
    if (kind === "contact") {
      router.push("/contact");
      return;
    }
    // Remember intent so the portal opens straight on the campaign form
    // (survives the sign-in redirect).
    try {
      localStorage.setItem("codeslot.intent", "new-campaign");
    } catch {
      /* ignore */
    }
    router.push("/portal");
  }

  return (
    <Button className="mt-6 w-full" variant={highlight ? "default" : "outline"} onClick={go}>
      {label}
    </Button>
  );
}
