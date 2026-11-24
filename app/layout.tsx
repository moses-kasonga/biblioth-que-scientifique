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
      <body>{children}</body>
    </html>
  );
}
