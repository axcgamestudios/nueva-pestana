/* axc-ui.js — Interfaz axc v2 · LIQUID GLASS
   Requiere: axc-auth.js. Usado por index.html, store.html, player.html
   - Diseño liquid glass (cristal líquido con reflejos especulares)
   - Glow que sigue el cursor (clase .glow — se aplica solo)
   - Buzón axc v2: el código llega y SE MUESTRA solo, en grande
   - launchGame(): los juegos corren DENTRO de la página, a pantalla
     completa, con animación FLIP desde la tarjeta + pantalla de carga
     con motion graphics. Instalar apps es OPCIONAL. */
window.AXC_UI = (function () {
  'use strict';
  if (window.AXC_UI) return window.AXC_UI;
  const $ = (s, r) => (r || document).querySelector(s);
  const AXC = window.AXC;

  /* ================== ESTILOS (liquid glass) ================== */
  const CSS = `
/* ---- material de cristal líquido ---- */
.axcui-root{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(3,4,9,.62);backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%);opacity:0;transition:opacity .3s}
.axcui-root.open{display:flex;opacity:1}
.axcui-card{position:relative;width:100%;max-width:430px;max-height:92vh;overflow:auto;
  background:linear-gradient(165deg,rgba(255,255,255,.13),rgba(255,255,255,.045) 40%,rgba(46,124,246,.07));
  backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);
  border:1px solid rgba(255,255,255,.16);border-radius:26px;
  box-shadow:0 34px 100px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04),0 0 90px rgba(46,124,246,.14),inset 0 1px 0 rgba(255,255,255,.28),inset 0 -18px 40px rgba(46,124,246,.05);
  padding:24px;transform:translateY(18px) scale(.96);transition:transform .45s cubic-bezier(.16,1,.3,1)}
.axcui-card::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)}
.axcui-root.open .axcui-card{transform:none}
.axcui-x{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#cfd6e4;font-size:15px;cursor:pointer;transition:.2s}
.axcui-x:hover{background:rgba(255,255,255,.14);transform:rotate(90deg)}
.axcui-logo{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.axcui-logo img{width:38px;height:38px;border-radius:11px;box-shadow:0 8px 26px rgba(0,0,0,.45)}
.axcui-logo b{font-family:'Space Grotesk',sans-serif;font-size:19px;letter-spacing:.2px}
.axcui-logo span{color:#38e8ff;font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;display:block;margin-top:-2px}
.axcui-tabs{display:flex;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:4px;margin-bottom:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.14)}
.axcui-tab{flex:1;padding:9px;border:0;border-radius:10px;background:transparent;color:rgba(245,246,247,.6);font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:.25s}
.axcui-tab.on{background:linear-gradient(135deg,#2e7cf6,#1b5fd9);color:#fff;box-shadow:0 4px 18px rgba(46,124,246,.45)}
.axcui-f{margin-bottom:12px}
.axcui-f label{display:block;font-size:12px;font-weight:600;color:rgba(245,246,247,.55);margin-bottom:6px;letter-spacing:.3px}
.axcui-f input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.06);color:#f5f6f7;font-size:15px;outline:none;transition:.25s;font-family:inherit}
.axcui-f input:focus{border-color:#2e7cf6;background:rgba(46,124,246,.09);box-shadow:0 0 0 3px rgba(46,124,246,.18)}
.axcui-btn{width:100%;padding:13px;border:0;border-radius:14px;background:linear-gradient(135deg,#2e7cf6,#1b5fd9);color:#fff;font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:.25s;box-shadow:0 8px 26px rgba(46,124,246,.35);display:flex;align-items:center;justify-content:center;gap:8px;position:relative;overflow:hidden}
.axcui-btn::after{content:'';position:absolute;top:0;left:-70%;width:45%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-18deg);transition:left .55s ease}
.axcui-btn:hover{transform:translateY(-1px);box-shadow:0 12px 34px rgba(46,124,246,.5);filter:brightness(1.08)}
.axcui-btn:hover::after{left:130%}
.axcui-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.axcui-btn.ghost{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.14);color:#dfe5f0}
.axcui-btn.ok{background:linear-gradient(135deg,#18c964,#0e9e4c);box-shadow:0 8px 26px rgba(24,201,100,.35)}
.axcui-err{display:none;background:rgba(255,77,109,.1);border:1px solid rgba(255,77,109,.35);color:#ff9db3;padding:10px 12px;border-radius:11px;font-size:13px;margin-bottom:12px;line-height:1.45}
.axcui-ok{background:rgba(24,201,100,.08);border:1px solid rgba(24,201,100,.3);color:#7ff0b0;padding:10px 12px;border-radius:11px;font-size:13px;margin-bottom:12px;line-height:1.5}
.axcui-note{font-size:12.5px;color:rgba(245,246,247,.5);line-height:1.55;margin-top:10px}
.axcui-otp{display:flex;gap:8px;justify-content:center;margin:6px 0 14px}
.axcui-otp input{width:46px;height:54px;text-align:center;font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;outline:none;transition:.2s}
.axcui-otp input:focus{border-color:#38e8ff;box-shadow:0 0 0 3px rgba(56,232,255,.2);transform:translateY(-2px)}
.axcui-otp input.filled{border-color:rgba(56,232,255,.55);background:rgba(56,232,255,.09)}
/* ---- BUZÓN AXC v2: el código se ve, llega solo ---- */
.axcui-mail{position:relative;border:1px solid rgba(56,232,255,.3);border-radius:18px;padding:15px;margin:14px 0;overflow:hidden;
  background:linear-gradient(160deg,rgba(56,232,255,.09),rgba(46,124,246,.05));box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.axcui-mail.waiting{animation:mailBreath 2.2s ease-in-out infinite}
@keyframes mailBreath{50%{box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 0 26px rgba(56,232,255,.22)}}
.axcui-mail-h{display:flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;font-size:12.5px;font-weight:700;letter-spacing:1.2px;color:#9fe8ff;margin-bottom:9px}
.axcui-mail-h .dot{width:8px;height:8px;border-radius:50%;background:#38e8ff;animation:axcui-blink 1.1s infinite}
@keyframes axcui-blink{50%{opacity:.15}}
.axcui-mail-b{font-size:13px;color:rgba(245,246,247,.75);line-height:1.6}
.axcui-mail-b b{color:#fff}
.axcenv{font-size:1.7rem;line-height:1;display:inline-block;margin-right:8px;animation:envFly 2.4s ease-in-out infinite}
@keyframes envFly{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-6px) rotate(4deg)}}
.axcui-mail.arrived{border-color:rgba(24,201,100,.45);background:linear-gradient(160deg,rgba(24,201,100,.12),rgba(46,124,246,.05))}
.axcui-mail.arrived .axcenv{animation:envPop .7s cubic-bezier(.16,1,.3,1)}
@keyframes envPop{0%{transform:scale(.4) rotate(-30deg);opacity:0}60%{transform:scale(1.3) rotate(8deg)}100%{transform:scale(1) rotate(0)}}
.axccode{display:flex;gap:7px;justify-content:center;margin:12px 0 4px}
.axccode i{font-style:normal;width:42px;height:50px;display:grid;place-items:center;border-radius:12px;font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:#041220;
  background:linear-gradient(160deg,#7deeff,#2e7cf6);box-shadow:0 8px 22px rgba(46,124,246,.4);animation:digitPop .55s cubic-bezier(.16,1,.3,1) backwards}
.axccode i:nth-child(1){animation-delay:.05s}.axccode i:nth-child(2){animation-delay:.13s}.axccode i:nth-child(3){animation-delay:.21s}
.axccode i:nth-child(4){animation-delay:.29s}.axccode i:nth-child(5){animation-delay:.37s}.axccode i:nth-child(6){animation-delay:.45s}
@keyframes digitPop{from{transform:translateY(18px) scale(.5) rotate(-8deg);opacity:0}}
.axcui-dots{display:flex;gap:14px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);flex-wrap:wrap}
.axcui-dot{display:flex;align-items:center;gap:6px;font-size:11.5px;color:rgba(245,246,247,.5)}
.axcui-dot i{width:8px;height:8px;border-radius:50%;background:#5a6274;display:inline-block}
.axcui-dot.on i{background:#18c964;box-shadow:0 0 8px rgba(24,201,100,.8)}
.axcui-dot.wait i{background:#f5b942}
.axcui-steps{margin:14px 0}
.axcui-step{display:flex;gap:12px;margin-bottom:12px;align-items:flex-start}
.axcui-step-n{flex:0 0 26px;height:26px;border-radius:9px;background:rgba(46,124,246,.15);border:1px solid rgba(46,124,246,.4);color:#7fb5ff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif}
.axcui-step p{font-size:13.5px;color:rgba(245,246,247,.78);line-height:1.55;margin:1px 0 0}
.axcui-step strong{color:#fff}
/* ---- toast ---- */
.axcui-toast{position:fixed;top:18px;left:50%;transform:translate(-50%,-100px);z-index:1400;
  background:linear-gradient(165deg,rgba(255,255,255,.14),rgba(255,255,255,.05));backdrop-filter:blur(26px) saturate(180%);-webkit-backdrop-filter:blur(26px) saturate(180%);
  border:1px solid rgba(56,232,255,.32);color:#e8f4ff;padding:12px 20px;border-radius:15px;font-size:14px;font-weight:600;
  box-shadow:0 18px 55px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.3);transition:transform .5s cubic-bezier(.16,1,.3,1);max-width:88vw;text-align:center}
.axcui-toast.show{transform:translate(-50%,0)}
/* ---- chip de cuenta ---- */
.axcui-chip{display:flex;align-items:center;gap:9px;padding:8px 14px;border-radius:13px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#f5f6f7;font-family:'Space Grotesk',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;transition:.25s;white-space:nowrap;backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 rgba(255,255,255,.16)}
.axcui-chip:hover{background:rgba(46,124,246,.18);border-color:rgba(46,124,246,.5)}
.axcui-ava{width:26px;height:26px;border-radius:9px;background:linear-gradient(135deg,#2e7cf6,#38e8ff);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#04101f;text-transform:uppercase}
.axcui-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:190px;background:rgba(14,18,32,.9);backdrop-filter:blur(28px) saturate(180%);border:1px solid rgba(255,255,255,.14);border-radius:15px;padding:8px;box-shadow:0 20px 55px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.2);display:none;z-index:60}
.axcui-menu.open{display:block}
.axcui-menu button{width:100%;text-align:left;padding:10px 12px;border:0;background:transparent;color:#dfe5f0;font-size:13.5px;border-radius:10px;cursor:pointer;font-family:inherit}
.axcui-menu button:hover{background:rgba(255,77,109,.14);color:#ffb3c2}
.axcui-menu .info{padding:8px 12px 6px;font-size:11.5px;color:rgba(245,246,247,.45);border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:6px;line-height:1.5}
/* ================== REPRODUCTOR EN PÁGINA (juego aquí mismo) ================== */
.axcplay{position:fixed;inset:0;z-index:1300;display:none;flex-direction:column;background:radial-gradient(90% 80% at 50% 20%,#0b1030 0%,#04050c 62%);opacity:0;transition:opacity .35s}
.axcplay.open{display:flex;opacity:1}
.axcplay-bar{position:relative;z-index:30;display:flex;align-items:center;gap:10px;padding:9px 14px;flex-wrap:wrap;
  background:rgba(8,10,18,.66);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
  border-bottom:1px solid rgba(255,255,255,.1);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 10px 34px rgba(0,0,0,.45)}
.axcplay-back{display:flex;align-items:center;gap:7px;padding:9px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#dfe5f0;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.82rem;cursor:pointer;transition:.25s}
.axcplay-back:hover{background:rgba(255,255,255,.13);color:#fff;transform:translateX(-2px)}
.axcplay-gt{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
.axcplay-gt img{width:30px;height:30px;border-radius:8px;object-fit:cover;box-shadow:0 6px 18px rgba(0,0,0,.5)}
.axcplay-gt b{font-family:'Space Grotesk',sans-serif;font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.axcplay-gt span{font-size:.64rem;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#38e8ff;white-space:nowrap}
.axcplay-act{display:flex;align-items:center;gap:7px;padding:9px 13px;border-radius:12px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);color:#cfe0f5;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.8rem;cursor:pointer;transition:.25s;text-decoration:none}
.axcplay-act:hover{background:rgba(46,124,246,.2);border-color:rgba(46,124,246,.5);color:#fff;transform:translateY(-1px)}
.axcplay-stage{position:relative;flex:1;background:#04050c}
.axcplay-stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#04050c;opacity:0;transition:opacity .6s .1s}
.axcplay.ready .axcplay-stage iframe{opacity:1}
/* pantalla de carga con motion graphics */
.axcplay-load{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;overflow:hidden;
  background:radial-gradient(80% 70% at 50% 30%,rgba(46,124,246,.16),rgba(4,5,12,.9) 75%);transition:opacity .55s,transform .55s}
.axcplay.ready .axcplay-load{opacity:0;transform:scale(1.06);pointer-events:none}
.axcplay-hero{position:relative;width:min(300px,52vw);aspect-ratio:3/4;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.2);
  box-shadow:0 34px 90px rgba(0,0,0,.7),0 0 80px rgba(46,124,246,.35);animation:heroIn .9s cubic-bezier(.16,1,.3,1) backwards}
@keyframes heroIn{from{opacity:0;transform:translateY(30px) scale(.82) rotate(-2deg)}}
.axcplay-hero img{width:100%;height:100%;object-fit:cover}
.axcplay-hero::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 60%,rgba(4,5,12,.75))}
.axcplay-rings{position:absolute;width:430px;height:430px;pointer-events:none}
.axcplay-rings i{position:absolute;inset:0;border-radius:50%;border:1.5px solid rgba(56,232,255,.35);animation:ringSpin 9s linear infinite}
.axcplay-rings i:nth-child(2){inset:34px;border-color:rgba(46,124,246,.4);border-style:dashed;animation-duration:13s;animation-direction:reverse}
.axcplay-rings i:nth-child(3){inset:72px;border-color:rgba(139,92,246,.32);animation-duration:17s}
@keyframes ringSpin{to{transform:rotate(360deg)}}
.axcplay-title{margin-top:20px;font-family:'Space Grotesk',sans-serif;font-size:clamp(1.5rem,3.6vw,2.3rem);font-weight:700;letter-spacing:-.02em;text-align:center;
  background:linear-gradient(100deg,#fff 20%,#9fe8ff 60%,#2e7cf6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  animation:titleUp .8s .25s cubic-bezier(.16,1,.3,1) backwards}
@keyframes titleUp{from{opacity:0;transform:translateY(16px);filter:blur(6px)}}
.axcplay-sub{font-size:.8rem;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;color:rgba(245,246,247,.55);animation:titleUp .8s .35s cubic-bezier(.16,1,.3,1) backwards}
.axcplay-prog{width:min(340px,72vw);height:5px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden;margin-top:22px;box-shadow:inset 0 1px 3px rgba(0,0,0,.5)}
.axcplay-prog i{display:block;height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,#2e7cf6,#38e8ff, #8b5cf6);background-size:200% 100%;animation:progShine 1.2s linear infinite;transition:width .3s ease;box-shadow:0 0 16px rgba(56,232,255,.7)}
@keyframes progShine{to{background-position:-200% 0}}
.axcplay-msg{margin-top:12px;font-family:'Space Grotesk',sans-serif;font-size:.85rem;color:#9fe8ff;letter-spacing:.4px;min-height:1.4em;animation:titleUp .8s .45s backwards}
.axcplay-msg b{animation:axcui-blink 1.2s infinite}
.axcplay-parts{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.axcplay-parts i{position:absolute;bottom:-12px;width:5px;height:5px;border-radius:50%;background:rgba(56,232,255,.65);box-shadow:0 0 10px rgba(56,232,255,.8);animation:partUp linear infinite}
@keyframes partUp{from{transform:translateY(0) scale(1);opacity:0}12%{opacity:.9}to{transform:translateY(-104vh) scale(.2);opacity:0}}
.axcplay-flip{position:fixed;z-index:1350;border-radius:20px;object-fit:cover;pointer-events:none;box-shadow:0 30px 90px rgba(0,0,0,.7),0 0 70px rgba(46,124,246,.5);transition:all .72s cubic-bezier(.16,1,.3,1)}
@media (max-width:520px){.axcui-otp input{width:40px;height:48px;font-size:21px}.axccode i{width:38px;height:46px;font-size:22px}.axcui-card{padding:20px}.axcplay-rings{width:320px;height:320px}}
`;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ================== DOM base ================== */
  const div = (id) => {
    const d = document.createElement('div');
    d.id = id; d.className = 'axcui-root';
    d.addEventListener('click', e => { if (e.target === d) closeModal(d); });
    document.body.appendChild(d);
    return d;
  };
  const authRoot = div('axc-auth-modal');
  const instRoot = div('axc-install-modal');
  const toastEl = document.createElement('div');
  toastEl.className = 'axcui-toast'; document.body.appendChild(toastEl);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (playRoot.classList.contains('open')) return closeGame();
      if (authRoot.classList.contains('open')) closeAuth();
      if (instRoot.classList.contains('open')) closeInstall();
    }
  });
  function openModal(m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(m) { m.classList.remove('open'); if (!authRoot.classList.contains('open') && !instRoot.classList.contains('open') && !playRoot.classList.contains('open')) document.body.style.overflow = ''; }

  /* ================== TOAST ================== */
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 3600);
  }

  /* ================== GLOW QUE SIGUE EL CURSOR ==================
     Cualquier elemento con clase .glow lleva un degradado de luz
     que persigue al puntero (borde + interior). Delegado: funciona
     también con contenido renderizado después. */
  document.addEventListener('pointermove', e => {
    let el = null;
    try { el = e.target && e.target.closest ? e.target.closest('.glow') : null; } catch (err) { }
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
  const GLOW_CSS = document.createElement('style');
  GLOW_CSS.textContent = `
.glow{position:relative}
.glow::before{content:'';position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity .4s;pointer-events:none;z-index:0;
  background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),rgba(56,232,255,.16),rgba(46,124,246,.09) 42%,transparent 66%)}
.glow:hover::before{opacity:1}
.glow::after{content:'';position:absolute;inset:0;border-radius:inherit;padding:1.4px;opacity:0;transition:opacity .45s;pointer-events:none;z-index:1;
  background:radial-gradient(190px circle at var(--mx,50%) var(--my,50%),rgba(56,232,255,.75),rgba(46,124,246,.35) 55%,transparent 75%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.glow:hover::after{opacity:1}
.glow>*{position:relative;z-index:2}`;
  document.head.appendChild(GLOW_CSS);
  /* aplica glow a tarjetas y botones comunes de las páginas axc */
  function autoGlow() {
    document.querySelectorAll('.game-card,.card,.app-card,.stat,.obj,.hchip,.filter-chip,.chip,.hbadge,.gate,.btn,.btn-play,.axcplay-act,.axcplay-back,.tab-btn').forEach(el => el.classList.add('glow'));
  }
  setInterval(autoGlow, 1500);
  addEventListener('load', autoGlow);

  /* ================== INSTALACIÓN PWA (OPCIONAL) ================== */
  let deferredPrompt = null;
  let instCfg = { app: 'main', name: 'axcStudios', icon: 'images/icon-192.png' };
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    document.querySelectorAll('[data-axc-install-ready]').forEach(b => b.classList.add('ready'));
  });
  addEventListener('appinstalled', () => {
    deferredPrompt = null;
    toast('🎉 App installed. Look for it on your desktop or home screen!');
    dispatchEvent(new CustomEvent('axc:pulse'));
    closeInstall();
  });

  async function nativeInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') toast('Instalando ' + instCfg.name + '…'); } catch (e) { }
      deferredPrompt = null;
      return true;
    }
    openInstall();
    return false;
  }

  function uaDevice() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }
  const INSTALL_STEPS = {
    desktop: [
      { t: 'It’s <strong>optional</strong>: in <strong>Chrome</strong> or <strong>Edge</strong>, click the ⤓ icon in the address bar and choose <strong>“Install page as app”</strong>.' },
      { t: 'Don’t see it? Menu <strong>⋮</strong> → <strong>“Apps” / “Install page as app”</strong>.' },
      { t: 'The app lands on your desktop and start menu. Everything works the same without installing: the games run on the page.' }
    ],
    android: [
      { t: 'It’s <strong>optional</strong>: in <strong>Chrome</strong>, tap the <strong>⋮</strong> menu at the top right.' },
      { t: 'Tap <strong>“Install app”</strong> (or “Add to Home screen”).' },
      { t: 'The icon joins your other apps. Without installing, everything keeps working on the page.' }
    ],
    ios: [
      { t: 'It’s <strong>optional</strong>: open the page in <strong>Safari</strong>.' },
      { t: 'Tap the <strong>Share</strong> button (square with an up arrow).' },
      { t: 'Choose <strong>“Add to Home Screen”</strong>. Everything works the same on the page without installing.' }
    ]
  };

  function openInstall(cfg) {
    if (cfg) instCfg = Object.assign(instCfg, cfg);
    const dev = uaDevice();
    instRoot.innerHTML = `
      <div class="axcui-card">
        <button class="axcui-x" data-close>✕</button>
        <div class="axcui-logo"><img src="${instCfg.icon}" alt=""><div><b>Install ${instCfg.name}</b><span>optional · native browser app</span></div></div>
        <div class="axcui-ok" id="axcInstNative" style="display:none"></div>
        <div class="axcui-steps">${INSTALL_STEPS[dev].map((s, i) => `<div class="axcui-step"><div class="axcui-step-n">${i + 1}</div><p>${s.t}</p></div>`).join('')}</div>
        <button class="axcui-btn" id="axcInstBtn">⚡ Install ${instCfg.name} now</button>
        <p class="axcui-note">Installing is <strong>optional</strong>: it adds the app to your desktop as a program, but the games run perfectly right here, on the page.</p>
      </div>`;
    const nb = $('#axcInstBtn', instRoot);
    const upd = () => {
      const n = $('#axcInstNative', instRoot);
      if (deferredPrompt) {
        n.style.display = 'block';
        n.innerHTML = '✅ Your browser has validated the app: the blue button opens the <b>native install dialog</b>.';
      } else {
        n.style.display = 'block';
        n.innerHTML = '⏳ The browser is still validating the app (a few seconds). You can use the steps above.';
      }
    };
    upd();
    nb.addEventListener('click', nativeInstall);
    $('[data-close]', instRoot).addEventListener('click', () => closeInstall());
    openModal(instRoot);
  }
  function closeInstall() { closeModal(instRoot); }

  /* ================== REPRODUCTOR DE JUEGOS EN LA PÁGINA ==================
     Los juegos corren DENTRO de la misma página (a pantalla completa),
     con animación FLIP desde la tarjeta y pantalla de carga con
     motion graphics. Instalar apps ya no es necesario. */
  const playRoot = document.createElement('div');
  playRoot.className = 'axcplay';
  playRoot.id = 'axc-play';
  document.body.appendChild(playRoot);
  let playMsgT = null, playProgT = null, playTO = null, currentGame = null;

  const LOAD_MSGS = [
    'Waking up the game engine',
    'Calibrating controls',
    'Loading sprites and sound',
    'Syncing with the axc network',
    'Final touches'
  ];

  function launchGame(game, fromEl) {
    if (!game || !game.url) return;
    currentGame = game;
    clearInterval(playMsgT); clearInterval(playProgT); clearTimeout(playTO);
    playRoot.classList.remove('ready');
    playRoot.innerHTML = `
      <div class="axcplay-bar">
        <button class="axcplay-back" id="axcPlayBack">← Back</button>
        <div class="axcplay-gt"><img src="${game.img}" alt=""><b>${esc(game.title)}</b><span>${esc(game.genre || '')}</span></div>
        <a class="axcplay-act" id="axcPlayFull" title="Full screen">⛶</a>
      </div>
      <div class="axcplay-stage" id="axcPlayStage">
        <div class="axcplay-load">
          <div class="axcplay-parts">${Array.from({ length: 14 }, (_, i) =>
            `<i style="left:${(i * 7.3 + 3) % 100}%;animation-duration:${5 + (i % 5) * 1.4}s;animation-delay:${(i * .45) % 4}s"></i>`).join('')}</div>
          <div class="axcplay-rings"><i></i><i></i><i></i></div>
          <div class="axcplay-hero" id="axcPlayHero"><img src="${game.img}" alt="${esc(game.title)}"></div>
          <div class="axcplay-title">${esc(game.title)}</div>
          <div class="axcplay-sub">${esc(game.genre || '')} · loading</div>
          <div class="axcplay-prog"><i id="axcPlayFill"></i></div>
          <div class="axcplay-msg" id="axcPlayMsg">${LOAD_MSGS[0]}<b>…</b></div>
        </div>
        <iframe id="axcPlayFrame" src="" title="${esc(game.title)}" allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write; microphone"></iframe>
      </div>`;
    $('#axcPlayBack', playRoot).addEventListener('click', closeGame);
    $('#axcPlayFull', playRoot).addEventListener('click', () => {
      const st = $('#axcPlayStage', playRoot);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
      else (st.requestFullscreen || st.webkitRequestFullscreen || function () { }).call(st);
    });
    openModal(playRoot);

    /* --- FLIP: la portada vuela desde la tarjeta hasta el centro --- */
    const heroImg = $('#axcPlayHero', playRoot) && $('#axcPlayHero', playRoot).querySelector('img');
    if (heroImg) heroImg.style.opacity = '0';
    let flip = null;
    const srcImg = fromEl ? (fromEl.querySelector('.game-cover img') || fromEl.querySelector('img')) : null;
    if (srcImg && heroImg) {
      const r = srcImg.getBoundingClientRect();
      flip = srcImg.cloneNode();
      flip.className = 'axcplay-flip';
      flip.style.left = r.left + 'px'; flip.style.top = r.top + 'px';
      flip.style.width = r.width + 'px'; flip.style.height = r.height + 'px';
      document.body.appendChild(flip);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const t = $('#axcPlayHero', playRoot).getBoundingClientRect();
        flip.style.left = t.left + 'px'; flip.style.top = t.top + 'px';
        flip.style.width = t.width + 'px'; flip.style.height = t.height + 'px';
      }));
      setTimeout(() => { if (flip) flip.remove(); flip = null; if (heroImg) { heroImg.style.transition = 'opacity .3s'; heroImg.style.opacity = '1'; } }, 780);
    } else if (heroImg) {
      heroImg.style.opacity = '1';
    }

    /* --- mensajes rotativos + progreso --- */
    let mi = 0;
    playMsgT = setInterval(() => {
      mi = (mi + 1) % LOAD_MSGS.length;
      const m = $('#axcPlayMsg', playRoot);
      if (m) { m.style.animation = 'none'; void m.offsetWidth; m.style.animation = ''; m.innerHTML = LOAD_MSGS[mi] + '<b>…</b>'; }
    }, 1400);
    const t0 = Date.now();
    playProgT = setInterval(() => {
      const el = $('#axcPlayFill', playRoot);
      if (!el) return clearInterval(playProgT);
      const e = Date.now() - t0;
      const p = Math.min(92, (e / 2100) * 92 + 4);
      el.style.width = p + '%';
    }, 120);

    function finish() {
      clearInterval(playProgT); clearInterval(playMsgT);
      const f = $('#axcPlayFill', playRoot);
      if (f) f.style.width = '100%';
      const m = $('#axcPlayMsg', playRoot);
      if (m) m.innerHTML = '✓ Ready! Let’s play!';
      setTimeout(() => playRoot.classList.add('ready'), 420);
      dispatchEvent(new CustomEvent('axc:pulse'));
    }
    const frame = $('#axcPlayFrame', playRoot);
    let minTime = new Promise(r => setTimeout(r, 1700));
    frame.addEventListener('load', () => { Promise.all([minTime]).then(finish); }, { once: true });
    frame.src = game.url;
    playTO = setTimeout(finish, 11000); /* por si el load no dispara */
  }

  function closeGame() {
    clearInterval(playMsgT); clearInterval(playProgT); clearTimeout(playTO);
    playRoot.classList.remove('open');
    setTimeout(() => { playRoot.innerHTML = ''; playRoot.classList.remove('ready'); }, 380);
    closeModal(playRoot);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ================== MODAL DE CUENTAS ================== */
  let mailPoll = null, resendT = null, resendLeft = 0, closable = true;

  function closeAuth() {
    clearInterval(mailPoll); clearTimeout(resendT);
    closeModal(authRoot);
  }

  function dots() {
    const st = AXC.state;
    const db = st.db === true ? '<span class="axcui-dot on"><i></i>Account server</span>'
      : st.db === false ? '<span class="axcui-dot"><i style="background:#ff4d6d"></i>Server down</span>'
        : '<span class="axcui-dot wait"><i></i>Connecting server…</span>';
    const ws = st.ws === 'online' ? '<span class="axcui-dot on"><i></i>axc network live</span>'
      : st.ws === 'connecting' ? '<span class="axcui-dot wait"><i></i>axc network connecting…</span>'
        : '<span class="axcui-dot"><i></i>axc network asleep</span>';
    return `<div class="axcui-dots">${db}${ws}</div>`;
  }

  function viewAuth(mode) {
    mode = mode || 'login';
    authRoot.innerHTML = `
      <div class="axcui-card">
        <button class="axcui-x" data-close>✕</button>
        <div class="axcui-logo"><img src="images/icon-192.png" alt="axcStudios"><div><b>axc account</b><span>one account · every page</span></div></div>
        <div class="axcui-tabs" id="axcTabs">
          <button class="axcui-tab" data-t="login">Sign in</button>
          <button class="axcui-tab" data-t="signup">Create account</button>
        </div>
        <div id="axcView"></div>
        ${dots()}
      </div>`;
    $('[data-close]', authRoot).addEventListener('click', () => { if (closable) closeAuth(); });
    $('#axcTabs', authRoot).querySelectorAll('.axcui-tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.t)));
    function showTab(t) {
      $('#axcTabs', authRoot).querySelectorAll('.axcui-tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      if (t === 'login') viewLogin(); else viewSignup1();
    }
    function viewLogin() {
      clearInterval(mailPoll);
      $('#axcView', authRoot).innerHTML = `
        <div class="axcui-err" id="axcErr"></div>
        <div class="axcui-f"><label>Username</label><input id="axcLu" autocomplete="username" spellcheck="false"></div>
        <div class="axcui-f"><label>Password</label><input id="axcLp" type="password" autocomplete="current-password"></div>
        <button class="axcui-btn" id="axcLb">Sign in →</button>
        <p class="axcui-note">The same account works on <strong>every axcStudios page</strong> (store, games and any site running the axc system).</p>`;
      const go = async () => {
        const btn = $('#axcLb', authRoot); btn.disabled = true; btn.textContent = 'Verifying…';
        const r = await AXC.login({ user: $('#axcLu', authRoot).value, pass: $('#axcLp', authRoot).value });
        btn.disabled = false; btn.textContent = 'Sign in →';
        if (r.ok) { toast('Welcome, ' + r.user + '! Signed in'); dispatchEvent(new CustomEvent('axc:pulse')); closeAuth(); }
        else { const e = $('#axcErr', authRoot); e.style.display = 'block'; e.textContent = r.error; if (/does not exist|no existe/i.test(r.error)) showTab('signup'); }
      };
      $('#axcLb', authRoot).addEventListener('click', go);
      $('#axcView', authRoot).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') go(); });
      $('#axcLu', authRoot).focus();
    }
    function viewSignup1() {
      clearInterval(mailPoll);
      $('#axcView', authRoot).innerHTML = `
        <div class="axcui-err" id="axcErr"></div>
        <div class="axcui-f"><label>Username <span style="opacity:.5">(3-16, letters/numbers/_)</span></label><input id="axcSu" autocomplete="username" spellcheck="false" placeholder="your_name"></div>
        <div class="axcui-f"><label>Email <span style="opacity:.5">(a profile detail)</span></label><input id="axcSm" type="email" autocomplete="email" placeholder="you@example.com"></div>
        <div class="axcui-f"><label>Password <span style="opacity:.5">(min 6)</span></label><input id="axcSp" type="password" autocomplete="new-password"></div>
        <button class="axcui-btn" id="axcSb">📨 Send verification code</button>
        <p class="axcui-note">Your 6-digit code arrives <strong>instantly in the axc Mailbox</strong> (you see it right here, big, automatically). Your password is stored encrypted (PBKDF2, never in plain text).</p>`;
      const go = async () => {
        const btn = $('#axcSb', authRoot); btn.disabled = true; btn.textContent = 'Sending code…';
        const r = await AXC.signup({
          user: $('#axcSu', authRoot).value,
          mail: $('#axcSm', authRoot).value,
          pass: $('#axcSp', authRoot).value
        });
        btn.disabled = false; btn.textContent = '📨 Send verification code';
        if (r.ok) viewSignup2(r); else { const e = $('#axcErr', authRoot); e.style.display = 'block'; e.textContent = r.error; }
      };
      $('#axcSb', authRoot).addEventListener('click', go);
      $('#axcView', authRoot).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') go(); });
      $('#axcSu', authRoot).focus();
    }
    function viewSignup2(info) {
      resendLeft = 0;
      $('#axcView', authRoot).innerHTML = `
        <div class="axcui-ok">📨 Code sent. Valid for <strong>15 minutes</strong>. The axc Mailbox below <strong>receives it automatically within seconds</strong> and types it for you.</div>
        <div class="axcui-mail waiting" id="axcMailBox">
          <div class="axcui-mail-h"><span class="dot"></span>✉ AXC MAILBOX · LIVE</div>
          <div class="axcui-mail-b" id="axcMailB"><span class="axcenv">✉️</span>Waiting for the server mail…</div>
        </div>
        <div class="axcui-f"><label>Enter the 6-digit code</label>
          <div class="axcui-otp" id="axcOtp">${[0, 1, 2, 3, 4, 5].map(i => `<input maxlength="1" inputmode="numeric" data-i="${i}">`).join('')}</div>
        </div>
        <div class="axcui-err" id="axcErr"></div>
        <button class="axcui-btn" id="axcVb">✓ Verify and create account</button>
        <div style="display:flex;gap:10px;margin-top:10px">
          <button class="axcui-btn ghost" id="axcRb" style="font-size:13.5px">Resend code</button>
          <button class="axcui-btn ghost" id="axcCb" style="font-size:13.5px">Change details</button>
        </div>`;
      /* OTP */
      const otp = $('#axcOtp', authRoot);
      const inputs = [...otp.querySelectorAll('input')];
      inputs.forEach((inp, i) => {
        inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); inp.classList.toggle('filled', !!inp.value); if (inp.value && i < 5) inputs[i + 1].focus(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus(); });
        inp.addEventListener('paste', e => {
          e.preventDefault();
          const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
          d.split('').forEach((c, j) => { if (inputs[j]) { inputs[j].value = c; inputs[j].classList.add('filled'); } });
          if (inputs[d.length]) inputs[Math.min(d.length, 5)].focus();
        });
      });
      inputs[0].focus();
      const code = () => inputs.map(i => i.value).join('');
      const setCode = (c) => {
        String(c).split('').forEach((ch, j) => { if (inputs[j]) { inputs[j].value = ch; inputs[j].classList.add('filled'); } });
      };

      /* BUZÓN AXC v2: el código llega del servidor y SE MUESTRA SOLO */
      async function pollMail() {
        if (!authRoot.classList.contains('open')) return;
        const m = await AXC.fetchMail();
        const box = $('#axcMailBox', authRoot);
        const b = $('#axcMailB', authRoot);
        if (!b || !box || box.classList.contains('arrived')) return;
        if (m) {
          box.classList.remove('waiting');
          box.classList.add('arrived');
          b.innerHTML = `📬 <b>Code received!</b> · from <b>${esc(m.from)}</b> · just now`;
          b.insertAdjacentHTML('afterend',
            `<div class="axccode">${String(m.code).split('').map(d => `<i>${d}</i>`).join('')}</div>
             <div style="text-align:center;font-size:12px;color:#7ff0b0;margin-bottom:4px">✓ Typed automatically below</div>`);
          setCode(m.code);
          clearInterval(mailPoll); mailPoll = null;
          toast('📬 Code received in the axc Mailbox ✓');
        } else if (!box.classList.contains('arrived')) {
          const secs = Math.round((Date.now() - (pollMail.t0 || (pollMail.t0 = Date.now()))) / 1000);
          b.innerHTML = `<span class="axcenv">✉️</span>Waiting for the server mail… <span style="opacity:.55">(${secs}s)</span>`;
          if (secs > 18) b.innerHTML += `<br><span style="font-size:12px;color:#f5b942">Taking more than 20s? Press <b>Resend code</b>: the server sometimes needs a moment to wake up.</span>`;
        }
      }
      clearInterval(mailPoll);
      pollMail.t0 = Date.now();
      mailPoll = setInterval(pollMail, 2000);
      pollMail();

      async function doVerify() {
        const btn = $('#axcVb', authRoot); btn.disabled = true; btn.textContent = 'Verifying…';
        const r = await AXC.verify(code());
        btn.disabled = false; btn.textContent = '✓ Verify and create account';
        if (r.ok) {
          clearInterval(mailPoll); mailPoll = null;
          toast('🎉 Account created, ' + r.user + '! Signed in');
          dispatchEvent(new CustomEvent('axc:pulse'));
          closeAuth();
        } else {
          const e = $('#axcErr', authRoot); e.style.display = 'block'; e.textContent = r.error;
        }
      }
      $('#axcVb', authRoot).addEventListener('click', doVerify);
      $('#axcCb', authRoot).addEventListener('click', () => { clearInterval(mailPoll); viewSignup1(); });
      $('#axcRb', authRoot).addEventListener('click', async () => {
        if (resendLeft > 0) return;
        const r = await AXC.sendCode();
        if (r.ok) {
          const box = $('#axcMailBox', authRoot), b = $('#axcMailB', authRoot);
          if (box) { box.classList.remove('arrived'); box.classList.add('waiting'); const cd = box.querySelector('.axccode'); if (cd) cd.remove(); const note = box.querySelector('div[style]'); }
          if (b) { b.innerHTML = '<span class="axcenv">✉️</span>Waiting for the server mail…'; }
          pollMail.t0 = Date.now();
          clearInterval(mailPoll); mailPoll = setInterval(pollMail, 2000); pollMail();
          resendLeft = 45;
          const btn = $('#axcRb', authRoot);
          const tick = () => {
            if (resendLeft <= 0) { clearTimeout(resendT); btn.textContent = 'Resend code'; btn.disabled = false; return; }
            btn.textContent = 'Resend in ' + resendLeft + 's'; btn.disabled = true; resendLeft--;
            resendT = setTimeout(tick, 1000);
          };
          tick();
          toast('Code resent ✓');
        } else { const e = $('#axcErr', authRoot); e.style.display = 'block'; e.textContent = r.error; }
      });
    }
    showTab(mode);
  }

  function openAuth(mode, opts) {
    closable = !(opts && opts.locked);
    viewAuth(mode);
    openModal(authRoot);
  }

  /* ================== CHIP DE CUENTA ================== */
  let chipEl = null, menuEl = null;
  function mountChip(el) {
    chipEl = typeof el === 'string' ? $(el) : el;
    if (!chipEl) return;
    renderChip();
    AXC.on('auth', renderChip);
  }
  function renderChip() {
    if (!chipEl) return;
    const u = AXC.state.user;
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (!u) {
      chipEl.innerHTML = `<button class="axcui-chip" id="axcChipBtn">👤 Sign in</button>`;
      $('#axcChipBtn').addEventListener('click', () => openAuth('login'));
      return;
    }
    chipEl.style.position = 'relative';
    chipEl.innerHTML = `<button class="axcui-chip" id="axcChipBtn"><span class="axcui-ava">${esc(u.u[0])}</span>${esc(u.u)} ▾</button>`;
    menuEl = document.createElement('div');
    menuEl.className = 'axcui-menu';
    menuEl.innerHTML = `<div class="info">Signed in as <b>${esc(u.u)}</b><br>${esc(u.m || '')}<br><span style="opacity:.6">Account valid on every axc page</span></div>
      <button id="axcLogout">Sign out</button>`;
    chipEl.appendChild(menuEl);
    $('#axcChipBtn').addEventListener('click', e => { e.stopPropagation(); menuEl.classList.toggle('open'); });
    document.addEventListener('click', () => menuEl.classList.remove('open'));
    $('#axcLogout').addEventListener('click', () => { AXC.logout(); toast('Signed out'); menuEl.classList.remove('open'); });
  }

  /* ================== INIT ================== */
  const handlers = { onAuth: null, onPresence: null, onStatus: null };
  async function init(opts) {
    opts = opts || {};
    Object.assign(instCfg, opts.install || {});
    Object.assign(handlers, opts);
    AXC.on('auth', u => { renderChip(); if (handlers.onAuth) handlers.onAuth(u); });
    AXC.on('presence', n => { if (handlers.onPresence) handlers.onPresence(n); });
    AXC.on('status', s => { const d = authRoot.querySelector('.axcui-dots'); if (d && authRoot.classList.contains('open')) d.outerHTML = dots(); if (handlers.onStatus) handlers.onStatus(s); });
    AXC.on('pulse', () => dispatchEvent(new CustomEvent('axc:pulse')));
    AXC.on('mailpush', () => { if (authRoot.classList.contains('open')) { const b = $('#axcMailB', authRoot); } });
    if (opts.chip) mountChip(opts.chip);
    await AXC.init(opts.axc || {});
    renderChip();
    autoGlow();
    if (handlers.onAuth) handlers.onAuth(AXC.state.user);
    return AXC.state;
  }

  return {
    init, toast,
    openAuth, closeAuth,
    openInstall, closeInstall, nativeInstall,
    mountChip,
    /* los juegos ya NO requieren app instalada: solo sesión */
    canPlay: () => !!AXC.state.user,
    launchGame, closeGame,
    standalone: () => AXC.standalone(),
    installReady: () => !!deferredPrompt,
    uaDevice
  };
})();

