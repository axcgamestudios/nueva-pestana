"use client";

/**
 * PÁGINA 1 — ESTUDIO del diseño axcStudios:
 * hero con logo 3D flotante (tilt con el ratón), badges, stats, apps
 * (instalación opcional), "qué ofrecemos" y objetivos del estudio.
 */
import { useEffect, useRef } from "react";
import { asset } from "@/lib/paths";

export default function Studio({
  gamesCount,
  onGoStore,
  onInstall,
}: {
  gamesCount: number;
  onGoStore: () => void;
  onInstall: () => void;
}) {
  const artRef = useRef<HTMLDivElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);

  // Tilt 3D del logo del héroe (solo con puntero fino)
  useEffect(() => {
    const art = artRef.current;
    const orb = orbRef.current;
    if (!art || !orb || window.matchMedia("(pointer:coarse)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = art.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      orb.style.transform = `rotateY(${x * 22}deg) rotateX(${-y * 16}deg) scale(1.04)`;
    };
    const onLeave = () => {
      orb.style.transform = "";
    };
    art.addEventListener("pointermove", onMove);
    art.addEventListener("pointerleave", onLeave);
    return () => {
      art.removeEventListener("pointermove", onMove);
      art.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const offers = [
    {
      title: "Clásicos arcade",
      text: "Las leyendas con las que crecimos: fútbol con coches cohete, karts, Pac-Man y Pokémon. Los clásicos, reconstruidos para la web moderna y jugables al instante.",
      icon: (
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      ),
    },
    {
      title: "Sagas originales",
      text: "Nuestras propias sagas nacidas en este estudio: Kingdom of the Forgotten Seas, Zona Cero y Grand Theft Voxel, con reglas, estética y universos propios.",
      icon: (
        <>
          <path d="M12 2 2 7l10 5 10-5-10-5Z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </>
      ),
    },
    {
      title: "Terror con identidad propia",
      text: "La saga FNAF completa: pizzerías abandonadas, animatrónicos acechando en la oscuridad y noches enteras de supervivencia por delante.",
      icon: (
        <>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </>
      ),
    },
    {
      title: "Cero fricción",
      text: "Sin instaladores de 80 GB. Abres el enlace y ya estás jugando; y si quieres el estudio en tu escritorio, un solo botón instala la web como app real.",
      icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    },
    {
      title: "Multiplataforma",
      text: "PC, móvil, tablet o Chromebook: nuestros juegos corren donde haya un navegador. Tu cuenta y tu progreso te siguen a cualquier pantalla.",
      icon: (
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      ),
    },
    {
      title: "La comunidad primero",
      text: "Escuchamos a quienes juegan: los títulos evolucionan con feedback real de la comunidad y cualquiera puede subir su juego a la tienda desde el panel.",
      icon: (
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      ),
    },
  ];

  const objectives = [
    {
      n: "01",
      title: "Hacer el gaming accesible para todos",
      text: "Derribar las barreras del gaming tradicional: sin hardware caro, sin descargas eternas. Si tienes un navegador, tienes una consola axcGames completa.",
    },
    {
      n: "02",
      title: "Construir sagas originales con identidad",
      text: "No vivimos de copiar: Kingdom of the Forgotten Seas, Zona Cero y Grand Theft Voxel nacen aquí, con sus propias reglas y universos que crean entrega tras entrega.",
    },
    {
      n: "03",
      title: "Llevar la web al límite",
      text: "La web es nuestra consola: gráficos 3D en tiempo real, cuentas con verificación real y juegos que arrancan en segundos en cualquier dispositivo.",
    },
    {
      n: "04",
      title: "Mantener el ecosistema gratis",
      text: "Docenas de juegos gratis hoy, más mañana. Nuestro modelo se sostiene en la comunidad y las ganas de crear, no en los bolsillos de quienes solo quieren jugar.",
    },
  ];

  return (
    <main id="page-studio" className="page active" role="tabpanel">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Estudio independiente · gaming web</span>
          <h1>
            <span className="w">Juega.</span> <span className="w">Instala.</span>
            <br />
            <em>Vive el universo axc.</em>
          </h1>
          <p className="lead">
            En axcGames creamos mundos que corren directo en tu navegador: {gamesCount} juegos
            gratis que juegas aquí mismo a pantalla completa, con una sola cuenta para todo el
            universo axc.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary glow" onClick={onGoStore}>
              Explorar la tienda →
            </button>
            <button className="btn btn-ghost glow" onClick={onInstall}>
              ⤓ Instalar apps · opcional
            </button>
          </div>
          <div className="hero-badges">
            <span className="hbadge glow">⚡ Juega sin instalar nada</span>
            <span className="hbadge glow">
              👤 Una cuenta, <b>todos los sitios</b>
            </span>
            <span className="hbadge glow">
              🎮 <b>{gamesCount} juegos gratis</b>
            </span>
          </div>
        </div>
        <div className="hero-art" id="heroArt" ref={artRef}>
          <div className="hero-orb" id="heroOrb" ref={orbRef}>
            <div className="hero-ring" />
            { }
            <img className="hero-logo" src={asset("/axc/logo.webp")} alt="Emblema de axcGames" />
          </div>
          <div className="hchip a glow">
            <i>🎮</i> {gamesCount} juegos
          </div>
          <div className="hchip b glow">
            <i>💬</i> Chat y llamadas
          </div>
          <div className="hchip c glow">
            <i>🔐</i> Cifrado PBKDF2
          </div>
        </div>
      </section>

      <section className="hero-stats">
        <div className="stat glow reveal">
          <div className="stat-num">{gamesCount}</div>
          <div className="stat-label">Juegos publicados</div>
        </div>
        <div className="stat glow reveal">
          <div className="stat-num">
            <em>100%</em>
          </div>
          <div className="stat-label">Gratis para jugar</div>
        </div>
        <div className="stat glow reveal">
          <div className="stat-num">1</div>
          <div className="stat-label">Cuenta para todo</div>
        </div>
        <div className="stat glow reveal">
          <div className="stat-num">2</div>
          <div className="stat-label">Apps opcionales</div>
        </div>
      </section>

      {/* APPS: instalación OPCIONAL */}
      <section className="section">
        <div className="section-head reveal">
          <div className="section-kicker">Instalación opcional</div>
          <h2>Dos apps, si las quieres en tu escritorio</h2>
          <p className="sub">
            Todo corre en la página sin instalar nada. Pero si quieres el estudio como programa
            de escritorio real, cada app se instala por separado: mismo sitio, link e icono
            propios.
          </p>
        </div>
        <div className="apps-grid">
          <article className="app-card glow reveal">
            <span className="app-pill">Esta página</span>
            { }
            <img src={asset("/axc/icon-512.png")} alt="Icono de axcGames" />
            <h3>axcGames</h3>
            <p>
              El estudio completo: información y tienda en una sola app. Opcional: sin
              instalar, todo funciona aquí mismo.
            </p>
            <button className="btn btn-primary" onClick={onInstall}>
              ⤓ Instalar el estudio
            </button>
          </article>
          <article className="app-card glow reveal">
            <span className="app-pill">app propia · opcional</span>
            { }
            <img src={asset("/axc/store-icon-512.png")} alt="Icono de axcStudios Games" />
            <h3>axcStudios Games</h3>
            <p>
              La tienda de axcStudios como app independiente: búsqueda, filtros y juegos
              dentro. Los juegos también corren en la página principal.
            </p>
            <a
              className="btn btn-primary"
              href="https://axcgamestudios.github.io/axcStudios/store.html?install=1"
              target="_blank"
              rel="noopener noreferrer"
            >
              ⤓ Instalar la tienda
            </a>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section-head reveal">
          <div className="section-kicker">Qué ofrecemos</div>
          <h2>Un estudio, todo un ecosistema gamer</h2>
          <p className="sub">
            No solo hacemos juegos: construimos la plataforma completa donde viven.
          </p>
        </div>
        <div className="grid-3">
          {offers.map((o) => (
            <article className="card glow reveal" key={o.title}>
              <div className="card-icon">
                <svg viewBox="0 0 24 24">{o.icon}</svg>
              </div>
              <h3>{o.title}</h3>
              <p>{o.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head reveal">
          <div className="section-kicker">Nuestros objetivos</div>
          <h2>Lo que nos mueve cada día</h2>
          <p className="sub">
            Cuatro metas claras que guían cada juego, cada línea de código y cada decisión del
            estudio.
          </p>
        </div>
        <div className="obj-list">
          {objectives.map((o) => (
            <div className="obj glow reveal" key={o.n}>
              <div className="obj-num">{o.n}</div>
              <div>
                <h4>{o.title}</h4>
                <p>{o.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
