import Script from "next/script";

// Consent Mode v2 (plan §7): the 'default' command -- denying everything --
// MUST run before gtag.js itself loads, so it's a raw inline <script> (NOT
// next/script) that executes in document order during HTML parse -- which is
// before any afterInteractive script (gtag.js) loads. This deliberately does
// NOT use next/script's beforeInteractive: that strategy is only honored in
// the ROOT app/layout, and this component renders from the nested [lang]
// layout, where beforeInteractive silently degrades and the consent-default
// is no longer guaranteed to run before gtag.js -- which would let GA set
// cookies before consent (PDPA exposure). The inline script's payload is a
// fixed constant (no interpolation), so dangerouslySetInnerHTML carries no
// injection surface. (Audit A18.)
export function Analytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  if (!measurementId) return null;

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied'
          });
        `,
        }}
      />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
