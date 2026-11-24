"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useLibraryLanguage } from "./library-shell";

const copy = {
fr:{eyebrow:"EXPLORER LES CONNAISSANCES",title:"Catalogue scientifique",intro:"Repérez les œuvres scientifiques, leurs éditions et leurs ressources. Le schéma Neon de développement est connecté ; le catalogue attend maintenant son premier import de notices vérifiées.",searchLabel:"Rechercher un titre, un auteur, un sujet ou un identifiant",placeholder:"Ex. : physique quantique, Marie Curie…",discipline:"Discipline",allDisciplines:"Toutes les disciplines",type:"Type de publication",allTypes:"Tous les types",period:"Période de publication",from:"De",to:"À",search:"Rechercher dans le catalogue",reset:"Réinitialiser",statusTitle:"Catalogue en préparation",status:"La connexion de développement à Neon fonctionne. Aucune notice réelle n’a encore été importée ; les résultats apparaîtront après validation du premier lot documentaire.",noFake:"Aucun résultat fictif n’est affiché.",disciplines:["Sciences naturelles","Mathématiques","Physique","Chimie","Biologie","Médecine","Informatique","Sciences de la Terre","Ingénierie","Sciences humaines et sociales"],types:["Livre","Monographie","Thèse","Actes de congrès","Rapport scientifique","Article"],result:"État de la recherche",unavailable:"Le service de recherche n’est pas encore connecté à la base documentaire. Réessayez après activation du catalogue.",error:"La recherche ne peut pas être exécutée pour le moment. Vérifiez la connexion puis réessayez.",model:"Comment le catalogue sera organisé",work:"Œuvres",workText:"L’identité intellectuelle d’un contenu scientifique.",edition:"Éditions",editionText:"Les publications, versions et caractéristiques éditoriales.",resource:"Ressources",resourceText:"Les accès numériques, avec leurs droits et conditions.",rights:"Comprendre les règles d’accès aux ressources",invalidYears:"L’année de début doit précéder l’année de fin.",emptyResults:"Aucune notice ne correspond à ces critères.",results:"Résultats",openRecord:"Ouvrir la fiche",record:"Notice"},
en:{eyebrow:"EXPLORE KNOWLEDGE",title:"Scientific catalogue",intro:"Discover scientific works, editions and associated resources. The Neon development schema is connected; the catalogue is now awaiting its first verified record import.",searchLabel:"Search by title, author, subject or identifier",placeholder:"E.g. quantum physics, Marie Curie…",discipline:"Discipline",allDisciplines:"All disciplines",type:"Publication type",allTypes:"All types",period:"Publication period",from:"From",to:"To",search:"Search the catalogue",reset:"Reset",statusTitle:"Catalogue in preparation",status:"The Neon development connection is working. No real records have been imported yet; results will appear after the first documentary batch is validated.",noFake:"No fictional search results are shown.",disciplines:["Natural sciences","Mathematics","Physics","Chemistry","Biology","Medicine","Computer science","Earth sciences","Engineering","Humanities and social sciences"],types:["Book","Monograph","Thesis","Conference proceedings","Scientific report","Article"],result:"Search status",unavailable:"The search service is not yet connected to the documentary database. Please try again after catalogue activation.",error:"The search cannot be completed right now. Check the connection and try again.",model:"How the catalogue will be structured",work:"Works",workText:"The intellectual identity of a scientific contribution.",edition:"Editions",editionText:"Published versions and their editorial characteristics.",resource:"Resources",resourceText:"Digital access, with its rights and conditions.",rights:"Understand resource access rules",invalidYears:"The start year must be earlier than the end year.",emptyResults:"No records match these criteria.",results:"Results",openRecord:"Open record",record:"Record"},
es:{eyebrow:"EXPLORAR EL CONOCIMIENTO",title:"Catálogo científico",intro:"Descubre obras científicas, sus ediciones y recursos asociados. El esquema de desarrollo de Neon está conectado; el catálogo espera ahora su primera importación de registros verificados.",searchLabel:"Buscar por título, autor, tema o identificador",placeholder:"Ej.: física cuántica, Marie Curie…",discipline:"Disciplina",allDisciplines:"Todas las disciplinas",type:"Tipo de publicación",allTypes:"Todos los tipos",period:"Período de publicación",from:"Desde",to:"Hasta",search:"Buscar en el catálogo",reset:"Restablecer",statusTitle:"Catálogo en preparación",status:"La conexión de desarrollo con Neon funciona. Todavía no se han importado registros reales; los resultados aparecerán tras validar el primer lote documental.",noFake:"No se muestran resultados ficticios.",disciplines:["Ciencias naturales","Matemáticas","Física","Química","Biología","Medicina","Informática","Ciencias de la Tierra","Ingeniería","Humanidades y ciencias sociales"],types:["Libro","Monografía","Tesis","Actas de congreso","Informe científico","Artículo"],result:"Estado de la búsqueda",unavailable:"El servicio de búsqueda todavía no está conectado a la base documental. Vuelve a intentarlo cuando se active el catálogo.",error:"No se puede realizar la búsqueda en este momento. Comprueba la conexión e inténtalo de nuevo.",model:"Cómo se organizará el catálogo",work:"Obras",workText:"La identidad intelectual de un contenido científico.",edition:"Ediciones",editionText:"Publicaciones, versiones y características editoriales.",resource:"Recursos",resourceText:"Acceso digital, con sus derechos y condiciones.",rights:"Comprender las reglas de acceso a los recursos",invalidYears:"El año inicial debe ser anterior al año final.",emptyResults:"Ningún registro coincide con estos criterios.",results:"Resultados",openRecord:"Abrir ficha",record:"Registro"},
pt:{eyebrow:"EXPLORAR O CONHECIMENTO",title:"Catálogo científico",intro:"Descubra obras científicas, as suas edições e recursos associados. O esquema de desenvolvimento Neon está ligado; o catálogo aguarda agora a primeira importação de registos verificados.",searchLabel:"Pesquisar por título, autor, assunto ou identificador",placeholder:"Ex.: física quântica, Marie Curie…",discipline:"Disciplina",allDisciplines:"Todas as disciplinas",type:"Tipo de publicação",allTypes:"Todos os tipos",period:"Período de publicação",from:"De",to:"Até",search:"Pesquisar no catálogo",reset:"Repor",statusTitle:"Catálogo em preparação",status:"A ligação de desenvolvimento ao Neon está a funcionar. Ainda não foram importados registos reais; os resultados serão apresentados após a validação do primeiro lote documental.",noFake:"Não são apresentados resultados fictícios.",disciplines:["Ciências naturais","Matemática","Física","Química","Biologia","Medicina","Informática","Ciências da Terra","Engenharia","Ciências humanas e sociais"],types:["Livro","Monografia","Tese","Atas de congresso","Relatório científico","Artigo"],result:"Estado da pesquisa",unavailable:"O serviço de pesquisa ainda não está ligado à base documental. Tente novamente após a ativação do catálogo.",error:"Não é possível efetuar a pesquisa neste momento. Verifique a ligação e tente novamente.",model:"Como o catálogo será organizado",work:"Obras",workText:"A identidade intelectual de um conteúdo científico.",edition:"Edições",editionText:"Publicações, versões e características editoriais.",resource:"Recursos",resourceText:"Acesso digital, com os respetivos direitos e condições.",rights:"Compreender as regras de acesso aos recursos",invalidYears:"O ano inicial deve ser anterior ao ano final.",emptyResults:"Nenhum registo corresponde a estes critérios.",results:"Resultados",openRecord:"Abrir registo",record:"Registo"}
} as const;
const disciplines=["natural","math","physics","chemistry","biology","medicine","computing","earth","engineering","humanities"];
const types=["book","monograph","thesis","proceedings","report","article"];

export default function CatalogueContent(){
  const language=useLibraryLanguage(), t=copy[language];
  const [query,setQuery]=useState(""),[discipline,setDiscipline]=useState("all"),[type,setType]=useState("all");
  const [fromYear,setFromYear]=useState("1720"),[toYear,setToYear]=useState("2026");
  const [state,setState]=useState<"idle"|"loading"|"ready"|"unavailable"|"error">("idle");
  const [results,setResults]=useState<Array<{work_id:string;work_type:string;description:string|null;creation_year_from:number|null;creation_year_to:number|null;titles:Array<{title:string;language:string|null;preferred:boolean}>;disciplines:Array<{code:string;label:string;primary:boolean}>;publication_types:Array<{code:string;label:string;primary:boolean}>}>>([]);
  const [resultCount,setResultCount]=useState(0);
  async function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setState("loading");
    const params=new URLSearchParams({q:query.trim(),discipline,type,from:fromYear,to:toYear,lang:language});
    try{
      const response=await fetch("/api/catalogue?"+params.toString(),{cache:"no-store"});
      if(response.status===503){setState("unavailable");return;}
      if(!response.ok){setState("error");return;}
      const payload=await response.json() as {data:typeof results;pagination:{returned:number}};
      setResults(payload.data);
      setResultCount(payload.pagination.returned);
      setState("ready");
    }catch{setState("error");}
  }
  function reset(){setQuery("");setDiscipline("all");setType("all");setFromYear("1720");setToYear("2026");setResults([]);setResultCount(0);setState("idle");}
  const invalidYears=Number(fromYear)>Number(toYear);
  return <main className="library-page">
    <section className="library-page-hero"><p className="library-eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro}</p></section>
    <section className="catalogue-workspace">
      <form className="catalogue-search-card" onSubmit={search}>
        <div className="catalogue-search-field"><label htmlFor="catalogue-query">{t.searchLabel}</label><input id="catalogue-query" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.placeholder}/></div>
        <div className="catalogue-filter-grid">
          <label>{t.discipline}<select value={discipline} onChange={e=>setDiscipline(e.target.value)}><option value="all">{t.allDisciplines}</option>{disciplines.map((v,i)=><option key={v} value={v}>{t.disciplines[i]}</option>)}</select></label>
          <label>{t.type}<select value={type} onChange={e=>setType(e.target.value)}><option value="all">{t.allTypes}</option>{types.map((v,i)=><option key={v} value={v}>{t.types[i]}</option>)}</select></label>
          <fieldset className="catalogue-period"><legend>{t.period}</legend><label><span>{t.from}</span><input type="number" min="1720" value={fromYear} onChange={e=>setFromYear(e.target.value)}/></label><label><span>{t.to}</span><input type="number" min="1720" value={toYear} onChange={e=>setToYear(e.target.value)}/></label></fieldset>
        </div>
        {invalidYears&&<p className="form-hint error-text" role="alert">{t.invalidYears}</p>}
        <div className="catalogue-actions"><button className="library-button primary" type="submit" disabled={state==="loading"||invalidYears}>{state==="loading"?"…":t.search}</button><button className="library-button secondary" type="button" onClick={reset}>{t.reset}</button></div>
      </form>
      <section className="catalogue-state-card" aria-live="polite"><div className="catalogue-state-icon" aria-hidden="true">⌕</div><p className="library-eyebrow">{t.result}</p><h2>{state==="ready"?t.results:t.statusTitle}</h2><p>{state==="unavailable"?t.unavailable:state==="error"?t.error:state==="ready"?`${resultCount} — ${t.results.toLowerCase()}`:t.status}</p><span className="catalogue-no-fake">{t.noFake}</span></section>
    </section>
    {state==="ready"&&<section className="catalogue-results" aria-live="polite">
      {results.length===0?<p className="catalogue-empty-results">{t.emptyResults}</p>:results.map(record=>{
        const preferred=record.titles.find(item=>item.preferred)||record.titles[0];
        const title=preferred?.title||t.record;
        const year=record.creation_year_from===record.creation_year_to?record.creation_year_from:record.creation_year_from&&record.creation_year_to?`${record.creation_year_from}–${record.creation_year_to}`:record.creation_year_from||record.creation_year_to;
        return <article className="catalogue-result-card" key={record.work_id}>
          <div><span className="library-eyebrow">{record.publication_types.map(item=>item.label).join(" · ")||record.work_type}</span><h2>{title}</h2>
          {year&&<p className="catalogue-result-year">{year}</p>}
          {record.description&&<p>{record.description}</p>}
          <div className="catalogue-result-tags">{record.disciplines.map(item=><span key={item.code}>{item.label}</span>)}</div></div>
          <Link className="library-button secondary" href={`/catalogue/${record.work_id}`}>{t.openRecord} ↗</Link>
        </article>;
      })}
    </section>}
    <section className="catalogue-model-section"><p className="library-eyebrow">{t.model}</p><div className="catalogue-model-grid">
      <article><span>01</span><h2>{t.work}</h2><p>{t.workText}</p></article><article><span>02</span><h2>{t.edition}</h2><p>{t.editionText}</p></article><article><span>03</span><h2>{t.resource}</h2><p>{t.resourceText}</p></article>
    </div><Link className="library-inline-link" href="/ressources">{t.rights} ↗</Link></section>
  </main>;
}
