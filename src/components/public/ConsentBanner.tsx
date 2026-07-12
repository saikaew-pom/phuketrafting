"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { saveCookieConsent } from "@/app/[lang]/consent-actions";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const STORAGE_KEY = "pr-cookie-consent";

export function ConsentBanner({ locale }: { locale: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // localStorage is unavailable during SSR, so this can't be a lazy
    // useState initializer without causing a hydration mismatch -- the
    // effect is the correct place for this one-time client-only read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function choose(granted: boolean) {
    localStorage.setItem(STORAGE_KEY, granted ? "granted" : "denied");
    window.gtag?.("consent", "update", {
      ad_storage: granted ? "granted" : "denied",
      ad_user_data: granted ? "granted" : "denied",
      ad_personalization: granted ? "granted" : "denied",
      analytics_storage: granted ? "granted" : "denied",
    });
    setVisible(false);
    // Fire-and-forget: PDPA needs the record, but a slow/failed write should
    // never block the visitor from continuing to browse.
    saveCookieConsent(granted).catch(() => {});
  }

  if (!visible) return null;

  return (
    <div className="pr-consent" role="dialog" aria-label="Cookie consent">
      <p>
        We use cookies to understand how visitors use this site. Essential cookies (like bot protection) run
        regardless; analytics cookies only run with your consent. See our{" "}
        <Link href={`/${locale}/privacy`}>Privacy Policy</Link>.
      </p>
      <div className="pr-consent-actions">
        <button className="pr-btn pr-btn-accent" onClick={() => choose(true)}>
          Accept
        </button>
        <button className="pr-btn pr-btn-ghost" onClick={() => choose(false)}>
          Decline
        </button>
      </div>
    </div>
  );
}
