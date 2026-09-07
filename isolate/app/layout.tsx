import type { Metadata, Viewport } from "next";
import { Noto_Sans_Devanagari, Noto_Emoji } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Ambient } from "@/components/ambient";

/* Self-hosted script + emoji fonts so Hindi (and emoji) never depend
   on device fonts — no tofu squares on any platform. Latin text keeps
   using the system stack; these only catch the chars it can't cover.
   Noto Emoji is monochrome, matching the pure black/white theme. */
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "block",
});
const emojiFont = Noto_Emoji({
  subsets: ["emoji"],
  variable: "--font-emoji",
  display: "block",
});

export const metadata: Metadata = {
  title: "Crack The Four-Digit Code",
  description:
    "A question-a-level brain teaser. Riddles, logic, math and trivia — beat the clock solo or race a live opponent through the same questions.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${devanagari.variable} ${emojiFont.variable}`}>
        <Providers>
          <Ambient />
          {children}
        </Providers>
      </body>
    </html>
  );
}
