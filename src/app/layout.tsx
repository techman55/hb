import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Every page depends on the signed-in user or live data.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Dibs", template: "%s · Dibs" },
  description: "Rent what you need for a day or a week from students at your school.",
  metadataBase: new URL("https://dibs.school"),
  openGraph: { siteName: "Dibs", type: "website" },
  // Icons and the web manifest come from the app/ file conventions (favicon.ico, apple-icon.png,
  // manifest.ts); this adds the iOS home-screen title.
  appleWebApp: { title: "Dibs" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg font-sans text-ink">
        {children}
        <Toaster position="top-center" richColors closeButton={false} />
      </body>
    </html>
  );
}
