import type { Metadata, Viewport } from "next";
import { Geist_Mono, Space_Grotesk, Unbounded } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL("https://axcgamestudios.github.io/nueva-pestana"),
  title: "nueva-pestaña",
  description:
    "Tu página de inicio: juegos, chat y amigos. Kingdom of the Forgotten Seas, Velocity GP, Emergency Strike, Apex Kart, Zona Cero, Minecraft y Grand Theft Voxel. Sin descargas, juega al instante en tu navegador.",
  keywords: [
    "juegos",
    "juegos gratis",
    "jugar online",
    "Velocity GP",
    "Emergency Strike",
    "Apex Kart",
    "Zona Cero",
    "Jeffcraft",
    "Minecraft",
  ],
  authors: [{ name: "nueva-pestaña" }],
  icons: {
    icon: [{ url: `${BP}/icon.png`, type: "image/png", sizes: "512x512" }],
    apple: [{ url: `${BP}/apple-icon.png`, type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "nueva-pestaña",
    description:
      "Tu portal premium: Velocity GP, Emergency Strike, Apex Kart, Zona Cero y Minecraft. Juega sin descargas.",
    siteName: "nueva-pestaña",
    type: "website",
    images: [{ url: `${BP}/logo-full.png`, width: 1024, height: 1024 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${geistMono.variable} ${unbounded.variable} antialiased bg-black text-white`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
