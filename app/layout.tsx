import type { Metadata } from "next";
import "./globals.css";

const siteTitle = "Bibliothèque Scientifique — Nexus Science";
const siteDescription =
  "La bibliothèque scientifique internationale de Nexus Science : découvrez les œuvres, leurs traductions, leurs éditions et les ressources numériques accessibles dans le respect des droits.";

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    template: "%s | Bibliothèque Scientifique — Nexus Science"
  },
  description: siteDescription,
  applicationName: siteTitle,
  keywords: [
    "Nexus Science",
    "Bibliothèque Scientifique",
    "scientific library",
    "biblioteca científica",
    "biblioteca científica",
    "catalogue scientifique",
    "ouvrages scientifiques",
    "éditions",
    "ressources numériques"
  ],
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: siteTitle,
    locale: "fr_FR",
    alternateLocale: ["en_US", "es_ES", "pt_PT"],
    type: "website"
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..600&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#0f5b63" />
      </head>
      <body>{children}</body>
    </html>
  );
}
