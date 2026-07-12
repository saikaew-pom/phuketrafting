import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phuket Rafting",
  description: "White-water rafting, ziplines and ATV adventures in Phang Nga, Thailand.",
};

// Kept minimal on purpose: fonts + public-site chrome (Nav/Footer) live in
// src/app/[lang]/layout.tsx, so /dashboard doesn't load Sora/Plus Jakarta Sans
// it never uses. See node_modules/next/dist/docs/.../layout.md -- a root
// layout can also live under a dynamic segment, but a shared minimal root +
// nested [lang] layout was simpler here than duplicating <html>/<body>.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
