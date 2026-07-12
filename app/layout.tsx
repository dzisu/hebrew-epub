import type { Metadata } from "next";
import "./globals.css";
import 'bootstrap/dist/css/bootstrap.min.css';

const title = "Hebrew EPUB";
const description = "Create Hebrew-friendly EPUB books with RTL support";
export const metadata: Metadata = {
  metadataBase: new URL("https://opencode.zisu.uk/hebrew-epub/"),
  title,
  description,
  icons: {
    icon: "/favicon-32x32.ico",
    apple: "/apple-touch-icon.png",
    other: [
      {
        rel: "icon",
        sizes: "16x16",
        url: "/favicon-16x16.png"
      }, {
        rel: "icon",
        sizes: "32x32",
        url: "/favicon-32x32.png",
      }
    ]
  },
  openGraph: {
    title,
    description,
    images: "/android-chome-512x512.png",
    type: "website",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body dir="rtl">
        {children}
      </body>
    </html>
  );
}
