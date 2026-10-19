#!/bin/bash
# Test E2E — límites de tiempo SEMANALES con enforcement activo.
#
# Parte A (panel): el botón "Activar límites AHORA" / "Desactivar" cambia la
#   fase del borrador sin guardar nada en el repo.
# Parte B (bloqueo): un usuario con más minutos jugados esta semana que su
#   límite ve la pantalla "SE ACABÓ TU TIEMPO DE ESTA SEMANA" y el iframe
#   NO se monta; además, lo jugado ANTES del lunes de esta semana no cuenta
#   (reset semanal).
#
# Se ejecuta contra el dev server (puerto 3000, sin basePath):
#   bash scripts/test-limits-enforcement.sh
cd /home/z/my-project
URL="http://localhost:3000/"
LOG=/tmp/limits-test.log
: > "$LOG"
AB="timeout 60 agent-browser"
USER="lcheck$RANDOM"

step() { echo "" | tee -a "$LOG"; echo "=== $1 ===" | tee -a "$LOG"; }
fail() { echo "FALLO: $1" | tee -a "$LOG"; cleanup_cloud; kill $SERVER_PID 2>/dev/null; exit 1; }
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

cleanup_cloud() {
  # Quitar la cuenta de prueba del registro de la nube y vaciar su doc.
  bun -e "
    const P='axcg-db-ad177030591d3cecc0ddbc51043cc50b0b3c4376';
    const r=await (await fetch('https://textdb.dev/api/data/'+P+'-registry')).json();
    const reg=typeof r==='string'?JSON.parse(r):r;
    if(reg.users && reg.users['$USER']){ delete reg.users['$USER'];
      await fetch('https://textdb.dev/api/data/'+P+'-registry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reg)});
      console.log('registro limpio');
    } else { console.log('no estaba en el registro'); }
    const uid='$TEST_UID';
    if(uid){ await fetch('https://textdb.dev/api/data/'+P+'-u-'+uid,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      console.log('doc de stats vaciado'); }
  " 2>/dev/null | tee -a "$LOG"
}
TEST_UID=""

# ---------------------------------------------------------------- 0) Servidor
SERVER_PID=""
if ! curl -s -o /dev/null -w "" --fail "$URL" 2>/dev/null; then
  echo "dev server no responde en $URL" | tee -a "$LOG"; exit 1
fi

# =============================================================== PARTE A: panel
step "A1. Abrir y preparar panel (token del remote)"
TOKEN=$(git remote get-url origin | sed -E 's|https://([^@]+)@.*|\1|')
$AB open "$URL" >>"$LOG" 2>&1
$AB eval "localStorage.clear(); 'limpio'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
$AB eval "window.__t='$TOKEN'; localStorage.setItem('axcgames:dev-token', window.__t); window.__t=null; 'token ok'" >>"$LOG" 2>&1
SEQ="['j','k','l'].forEach(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))); 'ok'"
for i in $(seq 1 12); do
  $AB eval "$SEQ" >>"$LOG" 2>&1
  if $AB eval "!!document.querySelector('[role=dialog] input[type=password]')" 2>/dev/null | grep -q true; then break; fi
  sleep 1.5
done
$AB eval "$SETVAL SV(document.querySelector('[role=dialog] input[type=password]'),'axsa11'); document.querySelector('[role=dialog] form').requestSubmit(); 'enviada'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('PANEL DE ADMINISTRACIÓN')" 8 || fail "no entró al panel"

step "A2. Pestaña Límites de tiempo"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Límites de tiempo'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Fase de observación') || document.body.innerText.includes('Límites activos')" 15 || fail "no cargó la config en la pestaña límites"
echo "pestaña límites cargada ✓" | tee -a "$LOG"

step "A3. Botón Activar/Desactivar"
$AB eval "var b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent.includes('Activar límites AHORA')); if(b){b.click();'clicked'}else{'NO BOTÓN'}" >>"$LOG" 2>&1
check "banner pasa a Límites activos" "document.body.innerText.includes('Límites activos desde')"
check "botón cambia a Desactivar" "[...document.querySelectorAll('[role=dialog] button')].some(x=>x.textContent.includes('Desactivar (solo observar)'))"
$AB screenshot /home/z/my-project/download/limits-panel-activado.png >/dev/null 2>&1
$AB eval "[...document.querySelectorAll('[role=dialog] button')].find(x=>x.textContent.includes('Desactivar (solo observar)'))?.click(); 'ok'" >>"$LOG" 2>&1
check "vuelve a fase de observación" "document.body.innerText.includes('Fase de observación')"
$AB press Escape >>"$LOG" 2>&1
echo "botón del panel ✓ (sin guardar nada)" | tee -a "$LOG"

# ============================================================ PARTE B: bloqueo
step "B1. Registrar cuenta de prueba (nube)"
$AB eval "localStorage.clear(); 'limpio'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
$AB eval "Array.from(document.querySelectorAll('header a,header button')).find(b=>b.textContent.trim()==='Entrar')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Bienvenido de nuevo')" 8 || fail "no abrió el login"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Crear cuenta'))?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.toUpperCase().includes('NOMBRE VISIBLE')" 8 || fail "no mostró el registro"
$AB eval "$SETVAL SV(document.getElementById('axc-username'),'$USER'); SV(document.getElementById('axc-password'),'clave123'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
espera_dom "Array.from(document.querySelectorAll('input')).some(i=>(i.getAttribute('placeholder')||'').includes('Buscar chat'))" 15 || fail "no terminó el registro"
TESTID=$($AB eval "JSON.parse(localStorage.getItem('axcg:accounts')||'{}')[localStorage.getItem('axcg:session')]?.user?.id || 'noid'" 2>/dev/null | tr -d '\r\n"')
echo "usuario=$USER uid=$TESTID" | tee -a "$LOG"
[ "$TESTID" != "noid" ] && [ -n "$TESTID" ] || fail "sin userId de sesión"
TEST_UID="$TESTID"

step "B2. Inyectar 30 min jugados esta semana + config con límites activos"
INJECT="(function(){
  const uid='$TESTID';
  const today=new Date().toLocaleDateString('sv-SE');
  localStorage.setItem('axcgames:playtime:'+uid, JSON.stringify({days:{[today]:{'apex-kart':1800}}, updatedAt: Date.now()}));
  localStorage.setItem('axcgames:pt-config', JSON.stringify({config:{version:999, observationStart:'2026-10-15', enforcementStart:'2026-10-01', defaultWeeklyLimitMinutes:20, users:{}}, fetchedAt: Date.now()}));
  return 'inyectado';
})()"
$AB eval "$INJECT" >>"$LOG" 2>&1

step "B3. Abrir un juego → debe BLOQUEARSE"
$AB eval "Array.from(document.querySelectorAll('header button')).find(b=>b.textContent.trim()==='Juegos')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('TODOS LOS JUEGOS')" 8 || fail "no llegó a juegos"
CLICK="var c=document.querySelector('div[aria-label=\"Jugar Apex Kart\"]');if(c){c.click();'clicked'}else{'nocard'}"
RES=$($AB eval "$CLICK" 2>/dev/null | tr -d '\r\n"')
[ "$RES" = "clicked" ] || fail "no se encontró la tarjeta de Apex Kart"
check "pantalla SE ACABÓ TU TIEMPO DE ESTA SEMANA" "document.body.innerText.includes('SE ACABÓ TU TIEMPO DE ESTA SEMANA')"
check "iframe del juego NO montado" "!document.querySelector('iframe[title=\"Apex Kart\"]')"
check "renovación el próximo lunes" "document.body.innerText.includes('se renueva el') && document.body.innerText.toLowerCase().includes('lunes')"
$AB screenshot /home/z/my-project/download/limits-bloqueo-excedido.png >/dev/null 2>&1
echo "bloqueo con límite semanal excedido ✓" | tee -a "$LOG"

step "B4. Reset semanal: lo jugado antes del lunes NO cuenta"
# Inyecta 10 h jugadas hace 8 días (semana pasada) y 0 esta semana → NO bloquea.
INJECTOLD="(function(){
  const uid='$TESTID';
  const d=new Date(); d.setDate(d.getDate()-8);
  const old=d.toLocaleDateString('sv-SE');
  localStorage.setItem('axcgames:playtime:'+uid, JSON.stringify({days:{[old]:{'apex-kart':36000}}, updatedAt: Date.now()}));
  return 'inyectado viejo';
})()"
$AB eval "$INJECTOLD" >>"$LOG" 2>&1
$AB eval "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith('Volver'))?.click(); 'ok'" >>"$LOG" 2>&1
sleep 1
$AB eval "Array.from(document.querySelectorAll('header button')).find(b=>b.textContent.trim()==='Juegos')?.click(); 'ok'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('TODOS LOS JUEGOS')" 8 || fail "no llegó a juegos"
RES=$($AB eval "$CLICK" 2>/dev/null | tr -d '\r\n"')
[ "$RES" = "clicked" ] || fail "no se encontró la tarjeta de Apex Kart (2)"
check "NO bloqueado: tiempo de la semana pasada no cuenta" "!!document.querySelector('iframe[title=\"Apex Kart\"]')"
echo "reset semanal (lunes) ✓" | tee -a "$LOG"

step "B5. Limpieza de la cuenta de prueba en la nube"
cleanup_cloud
echo "" | tee -a "$LOG"
echo "TODAS LAS PRUEBAS PASARON ✓" | tee -a "$LOG"
