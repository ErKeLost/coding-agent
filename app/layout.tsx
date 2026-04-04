import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "goey-toast/styles.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppGooeyToaster } from "@/components/ui/gooey-toaster";
import { DesktopUpdateCheck } from "@/components/desktop-update-check";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rovix",
  description: "Rovix desktop coding workspace with local tools and agent threads.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="light"
      data-color-theme="sand"
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased transition-colors duration-300`}
        style={{
          backgroundColor: "#f5efe5",
          color: "#41352b",
        }}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <DesktopUpdateCheck />
          <AppGooeyToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
