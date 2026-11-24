"use client";

import { useEffect, useState } from "react";

type Language = "fr" | "en" | "es" | "pt";

const copy = {
  fr: {
    brandModule: "Bibliothèque Scientifique",
    brandAria: "Nexus Science — Bibliothèque Scientifique — accueil",
    metaTitle: "Bibliothèque Scientifique — Nexus Science",
    metaDescription: "La bibliothèque scientifique internationale de Nexus Science : découvrez les œuvres, leurs traductions, leurs éditions et les ressources numériques accessibles dans le respect des droits.",
    navLabel: "Choisir la langue",
    eyebrow: "UNE BIBLIOTHÈQUE DE NEXUS SCIENCE",
    title: "La connaissance n’a pas de frontières.",
    intro:
      "La bibliothèque scientifique internationale de Nexus Science permet de repérer les œuvres, de comprendre leurs éditions et d’accéder aux ressources numériques disponibles dans le respect des droits.",
    explore: "Explorer le projet",
    visionKicker: "01 / VISION",
    methodKicker: "02 / MÉTHODE",
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
    statusTag: "FONDATIONS",
    footerCopyright: "Nexus Science · Bibliothèque Scientifique",
    footer: "Un projet de Nexus Science conçu pour grandir, sans frontières linguistiques."
  },
  en: {
    brandModule: "Scientific Library",
    brandAria: "Nexus Science — Scientific Library — home",
    metaTitle: "Scientific Library — Nexus Science",
    metaDescription: "Explore works, translations, editions and rights-aware digital resources through the Nexus Science international scientific library.",
    navLabel: "Choose language",
    eyebrow: "A LIBRARY BY NEXUS SCIENCE",
    title: "Knowledge has no borders.",
    intro:
      "Nexus Science’s international scientific library helps visitors discover works, understand their editions, and access digital resources in accordance with their rights.",
    explore: "Explore the project",
    visionKicker: "01 / VISION",
    methodKicker: "02 / METHOD",
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
    statusTag: "FOUNDATION",
    footerCopyright: "Nexus Science · Scientific Library",
    footer: "A Nexus Science project designed to grow, across language borders."
  },
  es: {
    brandModule: "Biblioteca Científica",
    brandAria: "Nexus Science — Biblioteca Científica — inicio",
    metaTitle: "Biblioteca Científica — Nexus Science",
    metaDescription: "Descubre obras, traducciones, ediciones y recursos digitales cuyo acceso respeta los derechos, en la biblioteca científica internacional de Nexus Science.",
    navLabel: "Elegir idioma",
    eyebrow: "UNA BIBLIOTECA DE NEXUS SCIENCE",
    title: "El conocimiento no tiene fronteras.",
    intro:
      "La biblioteca científica internacional de Nexus Science permite descubrir obras, conocer sus ediciones y acceder a los recursos digitales disponibles, respetando los derechos correspondientes.",
    explore: "Explorar el proyecto",
    visionKicker: "01 / VISIÓN",
    methodKicker: "02 / MÉTODO",
    scope: "Nuestra ambición",
    scopeText:
      "Construir un catálogo científico estructurado, multilingüe y ampliable, que abarque publicaciones desde 1720 hasta 2026 y más allá.",
    principles: "Nuestros principios",
    p1: "Registros bibliográficos fiables, incluso cuando el texto completo no está disponible.",
    p2: "Una distinción clara entre obras, traducciones, ediciones y recursos digitales.",
    p3: "El acceso a los documentos depende de sus derechos y de sus condiciones de consulta.",
    status: "Proyecto en construcción",
    statusText:
      "La base de la aplicación está en preparación. El catálogo y los servicios conectados se activarán después de validar el esquema de datos.",
    statusTag: "FUNDAMENTOS",
    footerCopyright: "Nexus Science · Biblioteca Científica",
    footer: "Un proyecto de Nexus Science diseñado para crecer, sin fronteras lingüísticas."
  },
  pt: {
    brandModule: "Biblioteca Científica",
    brandAria: "Nexus Science — Biblioteca Científica — início",
    metaTitle: "Biblioteca Científica — Nexus Science",
    metaDescription: "Explore obras, traduções, edições e recursos digitais, com acesso definido pelos respetivos direitos, na biblioteca científica internacional da Nexus Science.",
    navLabel: "Escolher idioma",
    eyebrow: "UMA BIBLIOTECA DA NEXUS SCIENCE",
    title: "O conhecimento não tem fronteiras.",
    intro:
      "A biblioteca científica internacional da Nexus Science permite descobrir obras, compreender as suas edições e aceder aos recursos digitais disponíveis, respeitando os respetivos direitos.",
    explore: "Conhecer o projeto",
    visionKicker: "01 / VISÃO",
    methodKicker: "02 / MÉTODO",
    scope: "A nossa ambição",
    scopeText:
      "Construir um catálogo científico estruturado, multilingue e extensível, abrangendo publicações de 1720 a 2026 e além.",
    principles: "Os nossos princípios",
    p1: "Registos bibliográficos fiáveis, mesmo quando o texto integral não está disponível.",
    p2: "Uma distinção clara entre obras, traduções, edições e recursos digitais.",
    p3: "O acesso aos documentos é determinado pelos respetivos direitos e condições de consulta.",
    status: "Projeto em desenvolvimento",
    statusText:
      "A base da aplicação está a ser preparada. O catálogo e os serviços ligados serão ativados após a validação do esquema de dados.",
    statusTag: "ESTRUTURA",
    footerCopyright: "Nexus Science · Biblioteca Científica",
    footer: "Um projeto da Nexus Science concebido para crescer, sem fronteiras linguísticas."
  }
} as const;

const languages: { code: Language; label: string }[] = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "pt", label: "PT" }
];

export default function HomeContent() {
  const [language, setLanguage] = useState<Language>("fr");
  const t = copy[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.metaTitle;

    const updateMeta = (selector: string, value: string) => {
      document.querySelector(selector)?.setAttribute("content", value);
    };

    updateMeta('meta[name="description"]', t.metaDescription);
    updateMeta('meta[name="application-name"]', t.metaTitle);
    updateMeta('meta[property="og:title"]', t.metaTitle);
    updateMeta('meta[property="og:description"]', t.metaDescription);
    updateMeta('meta[property="og:site_name"]', t.metaTitle);
    updateMeta('meta[name="twitter:title"]', t.metaTitle);
    updateMeta('meta[name="twitter:description"]', t.metaDescription);
  }, [language, t.metaTitle, t.metaDescription]);

  return (
    <main className="site-shell" lang={language}>
      <header className="topbar">
        <a className="brand" href="/" aria-label={t.brandAria}>
          <span className="brand-mark" aria-hidden="true">B</span>
          <span className="brand-name">
            <strong>NEXUS SCIENCE</strong>
            <span>{t.brandModule}</span>
          </span>
        </a>
        <nav className="language-switch" aria-label={t.navLabel}>
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
          <p className="card-kicker">{t.visionKicker}</p>
          <h2>{t.scope}</h2>
          <p>{t.scopeText}</p>
          <div className="timeline"><span>1720</span><i /><span>2026+</span></div>
        </article>
        <article className="info-card principles-card">
          <p className="card-kicker">{t.methodKicker}</p>
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
        <span className="status-tag">{t.statusTag}</span>
      </section>

      <footer className="footer">
        <span>© {new Date().getFullYear()} {t.footerCopyright}</span>
        <span>{t.footer}</span>
      </footer>
    </main>
  );
}
