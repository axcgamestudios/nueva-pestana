#!/bin/bash
# Test E2E — cuenta obligatoria para jugar + sin "abrir en pestaña nueva"
# Flujo: sin sesión no se puede jugar; tras registro se juega dentro; el link
# externo desaparece; el panel secreto j+k+l sigue funcionando.
cd /home/z/my-project
URL="http://127.0.0.1:4173/nueva-pestana/"
LOG=/tmp/gate-test.log
: > "$LOG"
AB="timeout 45 agent-browser"
USER="jugador$RANDOM"

step() { echo "" | tee -a "$LOG"; echo "=== $1 ===" | tee -a "$LOG"; }
fail() { echo "FALLO: $1" | tee -a "$LOG"; kill $SERVER_PID 2>/dev/null; exit 1; }
espera_dom() {
  local cond="$1" tries="${2:-10}"
  for i in $(seq 1 "$tries"); do
    if $AB eval "$cond" 2>/dev/null | grep -q true; then return 0; fi
    sleep 1.5
  done
  return 1
}
check() { # check <descr> <cond>
  espera_dom "$2" 4 || fail "$1"
  echo "ok: $1" | tee -a "$LOG"
}
# Setter nativo para inputs controlados por React
SETVAL="var SV=(el,v)=>{const P=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};"

# ---------------------------------------------------------------- 1) Servidor
node scripts/serve-out.js 4173 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT
sleep 1.5
curl -s -o /dev/null -w "servidor: %{http_code}\n" "$URL" | tee -a "$LOG"

# ------------------------------------------------- 2) Abrir SIN sesión (limpio)
step "1. Abrir sitio sin sesión"
$AB open "$URL" >>"$LOG" 2>&1
$AB eval "localStorage.clear(); 'limpio'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('TODOS LOS JUEGOS')" || fail "home no renderizó"
echo "home sin sesión ✓" | tee -a "$LOG"

# ------------------------------------- 3) Click en juego sin cuenta → auth gate
step "2. Click en 'Apex Kart' sin cuenta"
CLICK_CARD="var c=document.querySelector('div[aria-label=\"Jugar Apex Kart\"]');if(c){c.click();'clicked'}else{'nocard'}"
RES=$($AB eval "$CLICK_CARD" 2>/dev/null | tr -d '\r\n"')
echo "click: $RES" | tee -a "$LOG"
[ "$RES" = "clicked" ] || fail "no se encontró la tarjeta de Apex Kart"
check "aparece pantalla de cuenta" "document.body.innerText.includes('CREAR CUENTA') || document.body.innerText.includes('ENTRAR')"
check "copy contextual del juego pendiente" "document.body.innerText.includes('jugar a Apex Kart')"
check "sin botón 'seguir jugando sin cuenta'" "!document.body.innerText.includes('sin cuenta')"
$AB screenshot /home/z/my-project/download/gate-auth-pending.png >/dev/null 2>&1
echo "auth con juego pendiente ✓" | tee -a "$LOG"

# ------------------------------- 4) Logo (goHome) descarta el juego pendiente
step "3. Logo → home (descarta pendiente) y registro → chat"
$AB eval "document.querySelector('header button[aria-label*=inicio]')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('TODOS LOS JUEGOS')" 6 || fail "no volvió al home"
# Entrar desde el header (sin juego pendiente esta vez)
$AB eval "Array.from(document.querySelectorAll('header a,header button')).find(b=>b.textContent.trim()==='Entrar')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Bienvenido de nuevo')" 6 || fail "no abrió el login genérico"
# Cambiar a pestaña "Crear cuenta"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Crear cuenta'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.toUpperCase().includes('NOMBRE VISIBLE')" 6 || fail "no mostró el formulario de registro"
$AB eval "$SETVAL SV(document.getElementById('axc-username'),'$USER'); SV(document.getElementById('axc-password'),'clave123'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
check "registro ok → entra al CHAT (no a un juego)" "Array.from(document.querySelectorAll('input')).some(i=>(i.getAttribute('placeholder')||'').includes('Buscar chat'))"
echo "registro → chat (pendiente descartado) ✓ usuario=$USER" | tee -a "$LOG"

# ------------------- 5) Con sesión: click en juego → se abre DENTRO, sin link
step "4. Con sesión: abrir 'Grand Theft Voxel' dentro de la página"
$AB eval "Array.from(document.querySelectorAll('header button')).find(b=>b.textContent.trim()==='Juegos')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('TODOS LOS JUEGOS')" 6 || fail "no volvió a juegos"
RES=$($AB eval "var c=document.querySelector('div[aria-label=\"Jugar Grand Theft Voxel\"]');if(c){c.click();'clicked'}else{'nocard'}" 2>/dev/null | tr -d '\r\n"')
[ "$RES" = "clicked" ] || fail "no se encontró la tarjeta de Grand Theft Voxel"
check "game view abierto (título en toolbar)" "document.body.innerText.includes('GRAND THEFT VOXEL')"
check "iframe embebido presente" "!!document.querySelector('iframe[title=\"Grand Theft Voxel\"]')"
check "sin botón 'abrir en pestaña nueva'" "!document.body.innerText.includes('pestaña nueva')"
check "sin ningún enlace target=_blank" "!document.querySelector('a[target=_blank]')"
check "sin URL del juego visible" "!document.body.innerText.includes('axcgamestudios.github.io/GTV')"
$AB screenshot /home/z/my-project/download/gate-game-inside.png >/dev/null 2>&1
echo "juego dentro de la página, sin link externo ✓" | tee -a "$LOG"

# ------------------------------------------- 6) Panel secreto j+k+l intacto
step "5. Panel secreto j+k+l sigue funcionando"
SEQ="['j','k','l'].forEach(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))); 'ok'"
OPENED=0
for i in $(seq 1 8); do
  $AB eval "$SEQ" >>"$LOG" 2>&1
  if $AB eval "document.body.innerText.includes('ACCESO RESTRINGIDO')" 2>/dev/null | grep -q true; then OPENED=1; break; fi
  sleep 1.5
done
[ "$OPENED" = "1" ] || fail "no abrió el panel con j+k+l"
echo "panel secreto ✓" | tee -a "$LOG"
$AB screenshot /home/z/my-project/download/gate-dev-panel.png >/dev/null 2>&1

kill $SERVER_PID 2>/dev/null
echo "" | tee -a "$LOG"
echo "TODO OK ✓✓✓" | tee -a "$LOG"
