"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

export type LibraryLanguage = "fr" | "en" | "es" | "pt";
export type LibrarySection = "catalogue" | "record" | "resources";
const LanguageContext = createContext<LibraryLanguage>("fr");
export function useLibraryLanguage() { return useContext(LanguageContext); }

const copy = {
  fr: { home:"Accueil", catalogue:"Catalogue", resources:"Ressources numériques", language:"Choisir la langue", footer:"Un module de l’écosystème Nexus Science.", titles:{catalogue:"Catalogue scientifique",record:"Notice bibliographique",resources:"Ressources numériques"}, descriptions:{catalogue:"Recherchez des œuvres scientifiques, leurs éditions et leurs ressources dans le catalogue de Nexus Science.",record:"Structure d’une notice bibliographique : œuvre, traduction, édition, identifiants et ressources associées.",resources:"Comprendre les statuts d’accès, les licences et les conditions de consultation des ressources numériques."} },
  en: { home:"Home", catalogue:"Catalogue", resources:"Digital resources", language:"Choose language", footer:"A module of the Nexus Science ecosystem.", titles:{catalogue:"Scientific catalogue",record:"Bibliographic record",resources:"Digital resources"}, descriptions:{catalogue:"Search scientific works, editions and associated resources in the Nexus Science catalogue.",record:"Bibliographic record structure: work, translation, edition, identifiers and associated resources.",resources:"Understand access statuses, licences and consultation terms for digital resources."} },
  es: { home:"Inicio", catalogue:"Catálogo", resources:"Recursos digitales", language:"Elegir idioma", footer:"Un módulo del ecosistema Nexus Science.", titles:{catalogue:"Catálogo científico",record:"Registro bibliográfico",resources:"Recursos digitales"}, descriptions:{catalogue:"Busca obras científicas, ediciones y recursos asociados en el catálogo de Nexus Science.",record:"Estructura del registro bibliográfico: obra, traducción, edición, identificadores y recursos asociados.",resources:"Conoce los estados de acceso, las licencias y las condiciones de consulta de los recursos digitales."} },
  pt: { home:"Início", catalogue:"Catálogo", resources:"Recursos digitais", language:"Escolher idioma", footer:"Um módulo do ecossistema Nexus Science.", titles:{catalogue:"Catálogo científico",record:"Registo bibliográfico",resources:"Recursos digitais"}, descriptions:{catalogue:"Pesquise obras científicas, edições e recursos associados no catálogo da Nexus Science.",record:"Estrutura do registo bibliográfico: obra, tradução, edição, identificadores e recursos associados.",resources:"Compreenda os estados de acesso, as licenças e as condições de consulta dos recursos digitais."} }
} as const;
const options: {code:LibraryLanguage;label:string}[] = [{code:"fr",label:"FR"},{code:"en",label:"EN"},{code:"es",label:"ES"},{code:"pt",label:"PT"}];

export default function LibraryShell({section,children}:{section:LibrarySection;children:ReactNode}) {
  const [language,setLanguage] = useState<LibraryLanguage>("fr");
  const t = copy[language];
  useEffect(() => {
    const saved = window.localStorage.getItem("nexus-language");
    if (saved === "fr" || saved === "en" || saved === "es" || saved === "pt") setLanguage(saved);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("nexus-language",language);
    document.documentElement.lang = language;
    document.title = t.titles[section] + " | Bibliothèque Scientifique — Nexus Science";
    const description = t.descriptions[section];
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", document.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", document.title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description);
  },[language,section,t.titles]);
  return (
    <LanguageContext.Provider value={language}>
      <div className="library-shell">
        <header className="library-topbar">
          <div className="library-topbar-inner">
            <Link href="/" className="library-brand" aria-label="Nexus Science — Bibliothèque Scientifique">
              <span className="library-brand-mark" aria-hidden="true">🧬</span>
              <span className="library-brand-text"><strong>NEXUS SCIENCE</strong><small>Bibliothèque Scientifique</small></span>
            </Link>
            <nav className="library-nav" aria-label="Navigation principale">
              <Link href="/">{t.home}</Link>
              <Link href="/catalogue" aria-current={section === "catalogue" ? "page" : undefined}>{t.catalogue}</Link>
              <Link href="/ressources" aria-current={section === "resources" ? "page" : undefined}>{t.resources}</Link>
            </nav>
            <label className="library-language"><span className="sr-only">{t.language}</span>
              <select value={language} onChange={event => setLanguage(event.target.value as LibraryLanguage)}>
                {options.map(option=><option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </header>
        {children}
        <footer className="library-footer"><div className="library-footer-inner"><strong>NEXUS SCIENCE · BIBLIOTHÈQUE SCIENTIFIQUE</strong><span>{t.footer}</span></div></footer>
      </div>
    </LanguageContext.Provider>
  );
}
