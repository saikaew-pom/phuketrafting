import Script from "next/script";

// Consent Mode v2 (plan §7): the 'default' command -- denying everything --
// MUST run before gtag.js itself loads, so it's a plain inline script (not
// next/script) that queues onto dataLayer immediately. gtag.js reads that
// queue once it loads and never fires analytics collection until
// ConsentBanner calls 'consent'/'update' with granted:true.
export function Analytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  if (!measurementId) return null;

  return (
    <>
      <Script id="consent-default" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied'
          });
        `}
      </Script>
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
