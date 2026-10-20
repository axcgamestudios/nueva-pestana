#!/bin/bash
# Test E2E — 1 cuenta por dispositivo + pausa por inactividad.
#
# Parte A (dispositivo):
#   A1. Registrar la cuenta 1 → OK.
#   A2. Cerrar sesión y crear la cuenta 2 → bloqueado por el control LOCAL.
#   A3. Borrar las cuentas locales (conservando el ID de dispositivo) y crear
#       la cuenta 2 → bloqueado por el vínculo en la NUBE.
#   A4. Entrar con la cuenta 1 → el login sigue funcionando en el dispositivo.
# Parte B (inactividad):
#   B1. Config de prueba: pausa tras 3 s sin interacción (0.05 min).
#   B2. Con actividad simulada → el tiempo de juego CUENTA.
#   B3. Sin actividad → el contador se PAUSA (chip "Pausado por inactividad").
#   B4. Al volver la actividad → vuelve a contar.
#
# Se ejecuta contra el dev server (puerto 3000, sin basePath):
#   bash scripts/test-device-and-idle.sh
cd /home/z/my-project
URL="http://localhost:3000/"
LOG=/tmp/device-idle-test.log
: > "$LOG"
AB="timeout 60 agent-browser"
USER1="deva$RANDOM"
USER2="devb$RANDOM"
USER3="devc$RANDOM"
PASS="clave123"

step() { echo "" | tee -a "$LOG"; echo "=== $1 ===" | tee -a "$LOG"; }
fail() { echo "FALLO: $1" | tee -a "$LOG"; cleanup_cloud; exit 1; }
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
SETVAL="var SV=(el,v)=>{const P=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};"
CLICKCARD="var c=document.querySelector('div[aria-label=\"Jugar Apex Kart\"]');if(c){c.click();'clicked'}else{'nocard'}"

# IDs de las cuentas y dispositivos de prueba (para limpiar al final).
UID1=""; UID3=""; DEV_A=""; DEV_B=""

cleanup_cloud() {
  bun -e "
    const P='axcg-db-ad177030591d3cecc0ddbc51043cc50b0b3c4376';
    const r=await (await fetch('https://textdb.dev/api/data/'+P+'-registry')).json();
    const reg=typeof r==='string'?JSON.parse(r):r;
    let touched=false;
    for (const u of ['$USER1','$USER3']) {
      if (reg.users && reg.users[u]) { delete reg.users[u]; touched=true; }
    }
    if (reg.devices) {
      for (const k of ['$DEV_A','$DEV_B']) { if (reg.devices[k]) { delete reg.devices[k]; touched=true; } }
      for (const [k,v] of Object.entries(reg.devices)) {
        if (['$USER1','$USER3'].includes(v.username)) { delete reg.devices[k]; touched=true; }
      }
    }
    if (touched) {
      await fetch('https://textdb.dev/api/data/'+P+'-registry',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(reg)});
      console.log('registro limpio');
    } else { console.log('nada que limpiar en el registro'); }
    for (const uid of ['$UID1','$UID3']) {
      if (uid) await fetch('https://textdb.dev/api/data/'+P+'-u-'+uid,{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});
    }
    console.log('stats de prueba vaciados');
  " 2>/dev/null | tee -a "$LOG"
}

# ---------------------------------------------------------------- 0) Servidor
if ! curl -s -o /dev/null --fail "$URL" 2>/dev/null; then
  echo "dev server no responde en $URL" | tee -a "$LOG"; exit 1
fi

# ================================================== PARTE A: 1 cuenta/dispositivo
step "A1. Registrar la cuenta 1 ($USER1)"
$AB open "$URL" >>"$LOG" 2>&1
$AB eval "localStorage.clear(); 'limpio'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
$AB eval "document.visibilityState" >>"$LOG" 2>&1
$AB eval "Array.from(document.querySelectorAll('header a,header button')).find(b=>b.textContent.trim()==='Entrar')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Bienvenido de nuevo')" 8 || fail "no abrió el login"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Crear cuenta'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.toUpperCase().includes('NOMBRE VISIBLE')" 8 || fail "no mostró el registro"
$AB eval "$SETVAL SV(document.getElementById('axc-username'),'$USER1'); SV(document.getElementById('axc-password'),'$PASS'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
espera_dom "Array.from(document.querySelectorAll('input')).some(i=>(i.getAttribute('placeholder')||'').includes('Buscar chat'))" 15 || fail "no terminó el registro de la cuenta 1"
UID1=$($AB eval "JSON.parse(localStorage.getItem('axcg:accounts')||'{}')[localStorage.getItem('axcg:session')]?.user?.id || 'noid'" 2>/dev/null | tr -d '\r\n"')
DEV_A=$($AB eval "localStorage.getItem('axcg:device-id') || 'nodev'" 2>/dev/null | tr -d '\r\n"')
echo "cuenta1=$USER1 uid=$UID1 dev=$DEV_A" | tee -a "$LOG"
[ "$UID1" != "noid" ] && [ -n "$UID1" ] || fail "sin userId de sesión (cuenta 1)"

step "A2. Cerrar sesión y crear la cuenta 2 → bloqueo LOCAL"
$AB eval "localStorage.removeItem('axcg:session'); 'salido'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
$AB eval "Array.from(document.querySelectorAll('header a,header button')).find(b=>b.textContent.trim()==='Entrar')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Bienvenido de nuevo')" 8 || fail "no abrió el login (A2)"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Crear cuenta'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.toUpperCase().includes('NOMBRE VISIBLE')" 8 || fail "no mostró el registro (A2)"
$AB eval "$SETVAL SV(document.getElementById('axc-username'),'$USER2'); SV(document.getElementById('axc-password'),'$PASS'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
check "bloqueada por 1 cuenta por dispositivo (local)" "document.body.innerText.includes('Solo se permite 1 cuenta por dispositivo')"
$AB screenshot /home/z/my-project/download/device-limite-cuentas.png >/dev/null 2>&1
echo "cuenta 2 rechazada en este navegador ✓" | tee -a "$LOG"

step "A3. Borrar cuentas locales (conservando device-id) → bloqueo NUBE"
# Esperar a que el vínculo dispositivo→cuenta esté en la nube
BOUND=0
for i in $(seq 1 15); do
  if curl -s "https://textdb.dev/api/data/axcg-db-ad177030591d3cecc0ddbc51043cc50b0b3c4376-registry" | grep -q "$DEV_A"; then BOUND=1; break; fi
  sleep 2
done
[ "$BOUND" = "1" ] || fail "el vínculo de dispositivo no llegó a la nube"
echo "vínculo en la nube ✓" | tee -a "$LOG"
$AB eval "localStorage.removeItem('axcg:accounts'); localStorage.removeItem('axcg:session'); 'borradas'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
$AB eval "Array.from(document.querySelectorAll('header a,header button')).find(b=>b.textContent.trim()==='Entrar')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Bienvenido de nuevo')" 8 || fail "no abrió el login (A3)"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Crear cuenta'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.toUpperCase().includes('NOMBRE VISIBLE')" 8 || fail "no mostró el registro (A3)"
$AB eval "$SETVAL SV(document.getElementById('axc-username'),'$USER2'); SV(document.getElementById('axc-password'),'$PASS'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
check "bloqueada por vínculo de dispositivo en la nube" "document.body.innerText.includes('Este dispositivo ya tiene la cuenta')"
$AB screenshot /home/z/my-project/download/device-limite-nube.png >/dev/null 2>&1
echo "cuenta 2 rechazada aunque se borraron los datos locales ✓" | tee -a "$LOG"

step "A4. Entrar con la cuenta 1 → login permitido en el dispositivo"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Entrar'))?.click(); 'ok'" >>"$LOG" 2>&1
$AB eval "$SETVAL SV(document.getElementById('axc-username'),'$USER1'); SV(document.getElementById('axc-password'),'$PASS'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
espera_dom "Array.from(document.querySelectorAll('input')).some(i=>(i.getAttribute('placeholder')||'').includes('Buscar chat'))" 15 || fail "no entró con la cuenta 1"
echo "login con la cuenta existente ✓" | tee -a "$LOG"

# ================================================== PARTE B: inactividad
step "B1. Nueva identidad + config con pausa a los 3 s"
$AB eval "localStorage.clear(); 'limpio'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
$AB eval "Array.from(document.querySelectorAll('header a,header button')).find(b=>b.textContent.trim()==='Entrar')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Bienvenido de nuevo')" 8 || fail "no abrió el login (B)"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Crear cuenta'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.toUpperCase().includes('NOMBRE VISIBLE')" 8 || fail "no mostró el registro (B)"
$AB eval "$SETVAL SV(document.getElementById('axc-username'),'$USER3'); SV(document.getElementById('axc-password'),'$PASS'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
espera_dom "Array.from(document.querySelectorAll('input')).some(i=>(i.getAttribute('placeholder')||'').includes('Buscar chat'))" 15 || fail "no terminó el registro (cuenta 3)"
UID3=$($AB eval "JSON.parse(localStorage.getItem('axcg:accounts')||'{}')[localStorage.getItem('axcg:session')]?.user?.id || 'noid'" 2>/dev/null | tr -d '\r\n"')
DEV_B=$($AB eval "localStorage.getItem('axcg:device-id') || 'nodev'" 2>/dev/null | tr -d '\r\n"')
[ "$UID3" != "noid" ] && [ -n "$UID3" ] || fail "sin userId de sesión (cuenta 3)"
echo "cuenta3=$USER3 uid=$UID3 dev=$DEV_B" | tee -a "$LOG"
# Config cacheada: límites apagados y pausa por inactividad a los 0.05 min (3 s)
$AB eval "localStorage.setItem('axcgames:pt-config', JSON.stringify({config:{version:998, observationStart:'2026-10-01', enforcementStart:'2999-12-31', defaultWeeklyLimitMinutes:null, idleTimeoutMinutes:0.05, users:{}}, fetchedAt:Date.now()})); 'cfg inyectada'" >>"$LOG" 2>&1

secnow() {
  $AB eval "(()=>{const d=JSON.parse(localStorage.getItem('axcgames:playtime:$UID3')||'{}');const t=new Date().toLocaleDateString('sv-SE');return Math.round(((d.days||{})[t]||{})['apex-kart']||0)})()" 2>/dev/null | tr -d '\r\n"'
}

step "B2. Actividad simulada → el tiempo cuenta"
ACTON="window.__act=setInterval(()=>{document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));},400); 'act on'"
$AB eval "$ACTON" >>"$LOG" 2>&1
$AB eval "Array.from(document.querySelectorAll('header button')).find(b=>b.textContent.trim()==='Juegos')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('TODOS LOS JUEGOS')" 8 || fail "no llegó a juegos"
RES=$($AB eval "$CLICKCARD" 2>/dev/null | tr -d '\r\n"')
[ "$RES" = "clicked" ] || fail "no se encontró la tarjeta de Apex Kart"
espera_dom "!!document.querySelector('iframe[title=\"Apex Kart\"]')" 10 || fail "no montó el juego"
sleep 13
S1=$(secnow)
echo "segundos jugados con actividad: $S1" | tee -a "$LOG"
[ "$S1" -ge 5 ] 2>/dev/null || fail "no contó el tiempo con actividad (S1=$S1)"

step "B3. Sin actividad → el contador se pausa"
$AB eval "clearInterval(window.__act); 'act off'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Pausado por inactividad')" 12 || fail "no apareció el chip de pausa por inactividad"
$AB screenshot /home/z/my-project/download/idle-pausa.png >/dev/null 2>&1
S2=$(secnow)
sleep 10
S2B=$(secnow)
echo "segundos en pausa: $S2 → $S2B" | tee -a "$LOG"
[ "$S2B" = "$S2" ] || fail "el contador siguió sumando sin actividad ($S2 → $S2B)"
echo "tiempo pausado por inactividad ✓" | tee -a "$LOG"

step "B4. Vuelve la actividad → vuelve a contar"
$AB eval "$ACTON" >>"$LOG" 2>&1
sleep 12
S3=$(secnow)
echo "segundos tras reanudar: $S3" | tee -a "$LOG"
[ "$S3" -gt "$S2B" ] 2>/dev/null || fail "no reanudó el conteo al volver la actividad ($S2B → $S3)"
$AB eval "clearInterval(window.__act); 'act off'" >>"$LOG" 2>&1
echo "conteo reanudado ✓" | tee -a "$LOG"

step "B5. Limpieza de las cuentas de prueba en la nube"
cleanup_cloud
echo "" | tee -a "$LOG"
echo "TODAS LAS PRUEBAS PASARON ✓" | tee -a "$LOG"
