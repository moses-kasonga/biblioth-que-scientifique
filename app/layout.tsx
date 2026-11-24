import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bibliothèque scientifique",
    template: "%s | Bibliothèque scientifique"
  },
  description:
    "Un catalogue scientifique international pour découvrir les œuvres, leurs éditions et leurs ressources numériques.",
  applicationName: "Bibliothèque scientifique"
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
