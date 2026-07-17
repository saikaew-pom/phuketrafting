import { notFound } from "next/navigation";
import { Sora, Plus_Jakarta_Sans } from "next/font/google";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n";
import { Nav } from "@/components/public/Nav";
import { Footer } from "@/components/public/Footer";
import { ConsentBanner } from "@/components/public/ConsentBanner";
import { ChatWidget } from "@/components/public/ChatWidget";
import { getChatPolicy, getTheme, getLogo } from "@/lib/queries/settings";
import { deriveThemeVars } from "@/lib/theme";
import { Analytics } from "@/components/public/Analytics";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// EN prerendered at build time (plan §1); TH/ZH/RU resolve on-demand via the
// default dynamicParams=true -- real per-locale translated content (via
// MiniMax + content_translations, plan §8) is a follow-up. For now every
// locale renders the same EN copy so the URL structure/UI is ready ahead of it.
export async function generateStaticParams() {
  return [{ lang: DEFAULT_LOCALE }];
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) notFound();

  const [chat, theme, logo] = await Promise.all([getChatPolicy(), getTheme(), getLogo()]);
  // One admin-chosen brand colour, expanded to the three accent tokens and
  // emitted as a <style> that overrides the :root defaults for everything
  // inside .pr-app. Server-rendered, so there's no flash of the old colour.
  const vars = deriveThemeVars(theme.brandColor);

  return (
    <div className={`pr-app ${sora.variable} ${plusJakartaSans.variable}`}>
      <style
        dangerouslySetInnerHTML={{
          __html: `.pr-app{--accent:${vars.accent};--accent-dark:${vars.accentDark};--accent-soft:${vars.accentSoft};}`,
        }}
      />
      <Analytics />
      <Nav locale={lang} logo={logo} />
      {children}
      <Footer locale={lang} logo={logo} />
      <ConsentBanner locale={lang} />
      {/* Server-side gate: staff turning the chatbot off must ship NO widget,
          not a launcher that fails on click. Plan §9's master toggle. */}
      {chat.enabled && (
        <ChatWidget greeting="Hi! Ask me about tours, prices, pickup or what to bring. I'm an assistant -- our team confirms every booking." />
      )}
    </div>
  );
}
