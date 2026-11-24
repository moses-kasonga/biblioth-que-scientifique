"use client";

import { useState } from "react";

type Language = "fr" | "en" | "pt";

const copy = {
  fr: {
    eyebrow: "LE SAVOIR SCIENTIFIQUE, À TRAVERS LES SIÈCLES",
    title: "La connaissance n’a pas de frontières.",
    intro:
      "Une bibliothèque scientifique internationale pour repérer les œuvres, comprendre leurs éditions et accéder aux ressources numériques disponibles dans le respect des droits.",
    explore: "Explorer le projet",
    scope: "Notre ambition",
    scopeText:
      "Construire un catalogue scientifique structuré, multilingue et évolutif, couvrant les publications de 1720 à 2026 et au-delà.",
    principles: "Nos principes",
    p1: "Des notices bibliographiques fiables, même lorsqu’un texte intégral n’est pas disponible.",
    p2: "Une distinction claire entre œuvres, traductions, éditions et ressources numériques.",
    p3: "Un accès aux documents déterminé par leurs droits et leurs conditions de consultation.",
    status: "Projet en construction",
    statusText:
      "Le socle applicatif est en préparation. Le catalogue et les services connectés seront activés après validation du schéma de données.",
    footer: "Un projet conçu pour grandir, sans frontières linguistiques."
  },
  en: {
    eyebrow: "SCIENTIFIC KNOWLEDGE THROUGH THE CENTURIES",
    title: "Knowledge has no borders.",
    intro:
      "An international scientific library to discover works, understand their editions, and access available digital resources in accordance with rights.",
    explore: "Explore the project",
    scope: "Our ambition",
    scopeText:
      "Build a structured, multilingual and extensible scientific catalogue covering publications from 1720 to 2026 and beyond.",
    principles: "Our principles",
    p1: "Reliable bibliographic records, even when full text is unavailable.",
    p2: "A clear distinction between works, translations, editions and digital resources.",
    p3: "Access governed by each resource’s rights and consultation conditions.",
    status: "Project in development",
    statusText:
      "The application foundation is being prepared. The catalogue and connected services will be enabled after the data schema is validated.",
    footer: "A project designed to grow, without language borders."
  },
  pt: {
    eyebrow: "O CONHECIMENTO CIENTÍFICO ATRAVÉS DOS SÉCULOS",
    title: "O conhecimento não tem fronteiras.",
    intro:
      "Uma biblioteca científica internacional para descobrir obras, compreender as suas edições e aceder aos recursos digitais disponíveis, respeitando os direitos.",
    explore: "Conhecer o projeto",
    scope: "A nossa ambição",
    scopeText:
      "Construir um catálogo científico estruturado, multilingue e extensível, abrangendo publicações de 1720 a 2026 e além.",
    principles: "Os nossos princípios",
    p1: "Registos bibliográficos fiáveis, mesmo quando o texto integral não está disponível.",
    p2: "Uma distinção clara entre obras, traduções, edições e recursos digitais.",
    p3: "Acesso determinado pelos direitos e pelas condições de consulta de cada recurso.",
    status: "Projeto em desenvolvimento",
    statusText:
      "A base da aplicação está a ser preparada. O catálogo e os serviços ligados serão ativados após a validação do esquema de dados.",
    footer: "Um projeto concebido para crescer, sem fronteiras linguísticas."
  }
} as const;

const languages: { code: Language; label: string }[] = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
  { code: "pt", label: "PT" }
];

export default function HomeContent() {
  const [language, setLanguage] = useState<Language>("fr");
  const t = copy[language];

  return (
    <main className="site-shell" lang={language}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Bibliothèque scientifique — accueil">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span className="brand-name">Bibliothèque <strong>scientifique</strong></span>
        </a>
        <nav className="language-switch" aria-label="Choose language">
          {languages.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => setLanguage(item.code)}
              aria-pressed={language === item.code}
              className={language === item.code ? "language-active" : ""}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span />{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="hero-intro">{t.intro}</p>
          <a className="text-link" href="#project">{t.explore}<span aria-hidden="true"> ↗</span></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="book book-back" />
          <div className="book book-front">
            <div className="book-line" />
            <div className="book-line short" />
            <div className="book-seal">BS</div>
          </div>
          <div className="year-label">1720 — 2026</div>
        </div>
      </section>

      <section className="project-grid" id="project">
        <article className="info-card ambition-card">
          <p className="card-kicker">01 / VISION</p>
          <h2>{t.scope}</h2>
          <p>{t.scopeText}</p>
          <div className="timeline"><span>1720</span><i /><span>2026+</span></div>
        </article>
        <article className="info-card principles-card">
          <p className="card-kicker">02 / MÉTHODE</p>
          <h2>{t.principles}</h2>
          <ul>
            <li><span>01</span>{t.p1}</li>
            <li><span>02</span>{t.p2}</li>
            <li><span>03</span>{t.p3}</li>
          </ul>
        </article>
      </section>

      <section className="status-panel" aria-live="polite">
        <div className="status-indicator" />
        <div>
          <h2>{t.status}</h2>
          <p>{t.statusText}</p>
        </div>
        <span className="status-tag">FOUNDATION</span>
      </section>

      <footer className="footer">
        <span>© {new Date().getFullYear()} Bibliothèque scientifique</span>
        <span>{t.footer}</span>
      </footer>
    </main>
  );
}
