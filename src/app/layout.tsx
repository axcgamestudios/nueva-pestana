import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Tipografía del diseño axcStudios: Space Grotesk (display) + Inter (cuerpo)
// — legible, profesional y coherente con la identidad web del estudio.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL("https://axcgamestudios.github.io/nueva-pestana"),
  title: "axcGames — Juega sin límites",
  description:
    "Estudio de juegos web independiente: Kingdom of the Forgotten Seas, Velocity GP, Emergency Strike, Apex Kart, Zona Cero, Minecraft, Grand Theft Voxel y toda la saga FNAF. Sin descargas, juega al instante en tu navegador con una sola cuenta axc.",
  keywords: [
    "juegos",
    "juegos gratis",
    "jugar online",
    "Velocity GP",
    "Emergency Strike",
    "Apex Kart",
    "Zona Cero",
    "Minecraft",
    "FNAF",
  ],
  authors: [{ name: "axcGames" }],
  manifest: `${BP}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BP}/axc/icon-192.png`, type: "image/png", sizes: "192x192" }],
    apple: [{ url: `${BP}/axc/icon-192.png`, type: "image/png" }],
  },
  openGraph: {
    title: "axcGames — Juega sin límites",
    description:
      "Tu portal premium: Kingdom of the Forgotten Seas, Velocity GP, Zona Cero, Minecraft y la saga FNAF completa. Juega sin descargas.",
    siteName: "axcGames",
    type: "website",
    images: [{ url: `${BP}/axc/icon-512.png`, width: 512, height: 512 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
