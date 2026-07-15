// Per BUILD_AND_DEPLOY_PLAN.md's domain cutover plan -- the eventual
// production custom domain on the Worker. Used for canonical URLs, JSON-LD,
// sitemap.xml, and robots.txt.
export const SITE_URL = "https://phuketrafting.com";
export const BUSINESS_NAME = "Phuket Rafting (Le Rafting & ATV)";
export const BUSINESS_PHONE = "+66650102184";

// PLACEHOLDER -- the "leave us a review" link in the T+1 thank-you email
// (plan §2). This is a generic Google Maps search for the business, not the
// real one-click review URL, which needs the business's Google Place ID
// (https://search.google.com/local/writereview?placeid=...) and therefore
// needs the client's Google Business Profile. Tracked in plan §14 alongside
// the other real-value placeholders; swap this constant when the Place ID
// lands. The search link is a working, non-embarrassing fallback in the
// meantime, not a dead link.
export const GOOGLE_REVIEW_URL = "https://www.google.com/maps/search/?api=1&query=Phuket+Rafting+Phang+Nga";
