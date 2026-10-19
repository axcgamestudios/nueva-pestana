#!/bin/bash
# Test E2E — estadísticas de tiempo de juego + límites mensuales + horas extra
# Flujo: registrar usuario → jugar → se registra tiempo → panel de admin
# (Estadísticas / Límites) → simular límite agotado (bloqueo) → dar horas
# extra (bonus) → se vuelve a poder jugar.
cd /home/z/my-project
URL="http://127.0.0.1:3000/"
LOG=/tmp/playtime-test.log
: > "$LOG"
AB="timeout 60 agent-browser"
USER="jugador$RANDOM"

step() { echo "" | tee -a "$LOG"; echo "=== $1 ===" | tee -a "$LOG"; }
fail() { echo "FALLO: $1" | tee -a "$LOG"; exit 1; }
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

# ---------------------------------------------------------------- 1) Home limpio
step "1. Abrir sitio sin sesión"
$AB open "$URL" >>"$LOG" 2>&1
$AB eval "localStorage.clear(); 'limpio'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('TODOS LOS JUEGOS')" || fail "home no renderizó"
echo "home ✓" | tee -a "$LOG"

# ------------------------------------- 2) Click en juego sin cuenta → registro
step "2. Click en 'Apex Kart' sin cuenta → registrar → abre el juego"
CLICK="var c=document.querySelector('div[aria-label=\"Jugar Apex Kart\"]');if(c){c.click();'clicked'}else{'nocard'}"
RES=$($AB eval "$CLICK" 2>/dev/null | tr -d '\r\n"')
[ "$RES" = "clicked" ] || fail "no se encontró la tarjeta de Apex Kart"
espera_dom "document.body.innerText.includes('CREAR CUENTA') || document.body.innerText.includes('ENTRAR')" 6 || fail "no apareció el gate de cuenta"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Crear cuenta'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.toUpperCase().includes('NOMBRE VISIBLE')" 6 || fail "no mostró el formulario de registro"
$AB eval "$SETVAL SV(document.getElementById('axc-username'),'$USER'); SV(document.getElementById('axc-displayname'),'Jugador Prueba'); SV(document.getElementById('axc-password'),'clave123'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('APEX KART')" 8 || fail "no abrió el juego tras registrarse"
echo "registro → juego abierto ✓ usuario=$USER" | tee -a "$LOG"

# ------------------------------------- 3) El tiempo se registra (chip + storage)
step "3. Jugar ~12 s → el contador registra tiempo"
espera_dom "document.body.innerText.includes('Hoy:')" 6 || fail "no aparece el chip 'Hoy:' de observación"
sleep 12
CHECKPT="var ks=Object.keys(localStorage).filter(k=>k.startsWith('axcgames:playtime:'));if(ks.length===0)'nokey';else{var d=JSON.parse(localStorage.getItem(ks[0]));var t=new Date().toLocaleDateString('sv-SE');var day=d.days[t]||{};var s=Object.values(day).reduce((a,b)=>a+b,0);s>=5?'tracked:'+Math.round(s):'notracking:'+s}"
RES=$($AB eval "$CHECKPT" 2>/dev/null | tr -d '\r\n"')
echo "$RES" | tee -a "$LOG"
case "$RES" in
  tracked:*) echo "tiempo registrado ✓ ($RES s)" | tee -a "$LOG" ;;
  *) fail "el tiempo de juego no se registró ($RES)" ;;
esac
$AB screenshot /home/z/my-project/download/playtime-game-chip.png >/dev/null 2>&1

# ------------------------------------- 4) Panel de admin: Estadísticas
step "4. Panel admin (j+k+l) → pestaña Estadísticas"
$AB eval "localStorage.setItem('axcgames:dev-token','dummy-token-para-test'); 'ok'" >>"$LOG" 2>&1
SEQ="['j','k','l'].forEach(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))); 'ok'"
OPENED=0
for i in $(seq 1 8); do
  $AB eval "$SEQ" >>"$LOG" 2>&1
  if $AB eval "document.body.innerText.includes('ACCESO RESTRINGIDO')" 2>/dev/null | grep -q true; then OPENED=1; break; fi
  sleep 1.5
done
[ "$OPENED" = "1" ] || fail "no abrió el panel con j+k+l"
$AB eval "$SETVAL SV(document.querySelector('input[type=password]'),'axsa11'); document.querySelector('form button[type=submit]').click(); 'pwd'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('PANEL DE ADMINISTRACIÓN')" 6 || fail "no entró al panel"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Estadísticas'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('MEDIA/DÍA') || document.body.innerText.includes('Media/día')" 8 || fail "no cargó la tabla de estadísticas"
check "banner de fase de observación" "document.body.innerText.includes('Fase de observación')"
check "fila del jugador con @username" "document.body.innerText.includes('@$USER')"
check "estadísticas con tiempo de hoy" "document.body.innerText.includes('12m') || document.body.innerText.includes('10m') || document.body.innerText.includes('Hoy')"
# Detalle: gráfico de 14 días + juegos favoritos
CLICKROW="var r=Array.from(document.querySelectorAll('tbody tr')).find(t=>t.textContent.includes('$USER'));if(r){r.click();'ok'}else{'norow'}"
RES=$($AB eval "$CLICKROW" 2>/dev/null | tr -d '\r\n"')
[ "$RES" = "ok" ] || fail "no se encontró la fila del jugador en estadísticas"
espera_dom "document.body.innerText.includes('ÚLTIMOS 14 DÍAS') || document.body.innerText.includes('Últimos 14 días')" 5 || fail "no se desplegó el detalle de 14 días"
echo "panel estadísticas ✓" | tee -a "$LOG"
$AB screenshot /home/z/my-project/download/playtime-admin-stats.png >/dev/null 2>&1

# ------------------------------------- 5) Panel de admin: Límites
step "5. Pestaña Límites de tiempo"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Límites de tiempo'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Horas extra') || document.body.innerText.includes('Límite general')" 10 || fail "no cargó la pestaña de límites"
check "botones +1 h / +2 h" "document.body.innerText.includes('+1 h') && document.body.innerText.includes('+2 h')"
check "usuario en la lista de límites" "document.body.innerText.includes('@$USER')"
# Botón "Sugerir por estadísticas" habilitado
$AB eval "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Sugerir'))?.click(); 'ok'" >>"$LOG" 2>&1
sleep 1
check "límite sugerido rellena el input" "!!Array.from(document.querySelectorAll('input[type=number]')).some(i=>i.value!=='' && Number(i.value)>=60)"
$AB screenshot /home/z/my-project/download/playtime-admin-limits.png >/dev/null 2>&1
echo "panel límites ✓" | tee -a "$LOG"

# Cerrar panel para volver al juego
$AB eval "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 'esc'" >>"$LOG" 2>&1
sleep 1

# ------------------------------------- 6) Límite agotado → bloqueo
step "6. Simular límite mensual agotado → pantalla de bloqueo"
INJECT="var s=JSON.parse(localStorage.getItem('axcg:accounts'))[localStorage.getItem('axcg:session')];var uid=s.user.id;var t=new Date().toLocaleDateString('sv-SE');var m=t.slice(0,7);var d=JSON.parse(localStorage.getItem('axcgames:playtime:'+uid)||'{\"days\":{}}');d.days[t]={'apex-kart':400};d.updatedAt=Date.now();localStorage.setItem('axcgames:playtime:'+uid,JSON.stringify(d));var cfg={config:{version:99,observationStart:'2026-10-15',enforcementStart:t,defaultWeeklyLimitMinutes:5,users:{}},fetchedAt:Date.now()};localStorage.setItem('axcgames:pt-config',JSON.stringify(cfg));'inyectado'"
$AB eval "$INJECT" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
$AB eval "$CLICK" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('SE ACABÓ TU TIEMPO DE ESTE MES')" 8 || fail "no apareció la pantalla de bloqueo"
check "sin iframe al estar bloqueado" "!document.querySelector('iframe[title=\"Apex Kart\"]')"
check "chip en rojo con 0 restante" "document.body.innerText.includes('Restan 0m este mes')"
echo "bloqueo por límite ✓" | tee -a "$LOG"
$AB screenshot /home/z/my-project/download/playtime-blocked.png >/dev/null 2>&1

# ------------------------------------- 7) Horas extra del admin → se puede jugar
step "7. Dar 2 h extra (bonus) → vuelve a poder jugar"
BONUS="var s=JSON.parse(localStorage.getItem('axcg:accounts'))[localStorage.getItem('axcg:session')];var uid=s.user.id;var t=new Date().toLocaleDateString('sv-SE');var m=t.slice(0,7);var cfg=JSON.parse(localStorage.getItem('axcgames:pt-config'));cfg.config.users={};cfg.config.users[uid]={username:'$USER',weeklyLimitMinutes:5,bonusMinutes:{}};cfg.config.users[uid].bonusMinutes[m]=120;cfg.fetchedAt=Date.now();localStorage.setItem('axcgames:pt-config',JSON.stringify(cfg));'bonus'"
$AB eval "$BONUS" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
$AB eval "$CLICK" >>"$LOG" 2>&1
espera_dom "!!document.querySelector('iframe[title=\"Apex Kart\"]')" 10 || fail "no se reanudó el juego tras el bonus"
check "chip muestra tiempo restante con bonus" "document.body.innerText.includes('Restan 1h 5') || document.body.innerText.includes('Restan 1h 4') || document.body.innerText.includes('Restan 1h 3')"
echo "horas extra aplicadas ✓" | tee -a "$LOG"
$AB screenshot /home/z/my-project/download/playtime-bonus-resumed.png >/dev/null 2>&1

echo "" | tee -a "$LOG"
echo "TODO OK ✓✓✓" | tee -a "$LOG"
