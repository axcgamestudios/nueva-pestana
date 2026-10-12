#!/bin/bash
# Test E2E del panel de desarrollador — v4: flujo completo por DOM/JS directo
# (inputs controlados de React requieren el setter nativo; portada via DataTransfer)
cd /home/z/my-project
URL="http://127.0.0.1:4173/nueva-pestana/"
LOG=/tmp/panel-test.log
: > "$LOG"
AB="timeout 45 agent-browser"

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
# Setter nativo para inputs controlados por React
SETVAL="var SV=(el,v)=>{const P=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};"

# 1) Servidor
node scripts/serve-out.js 4173 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT
sleep 1.5
curl -s -o /dev/null -w "servidor: %{http_code}\n" "$URL" | tee -a "$LOG"

step "1. Abrir sitio"
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
D=$($AB get count '[role="dialog"]' 2>/dev/null | tr -d '\r')
echo "dialogs antes de jkl: '$D' (esperado 0)" | tee -a "$LOG"

step "2. Secuencia j k l"
SEQ="['j','k','l'].forEach(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))); 'ok'"
OPENED=0
for i in $(seq 1 12); do
  $AB eval "$SEQ" >>"$LOG" 2>&1
  if $AB eval "!!document.querySelector('[role=dialog] h2')" 2>/dev/null | grep -q true; then OPENED=1; break; fi
  sleep 1.5
done
[ "$OPENED" = "1" ] || fail "no abrió el panel"
$AB eval "document.body.innerText.includes('ACCESO RESTRINGIDO')" 2>/dev/null | grep -q true || fail "cabecera incorrecta"
echo "panel abierto ✓" | tee -a "$LOG"

step "3. Contraseña incorrecta"
$AB eval "$SETVAL SV(document.querySelector('[role=dialog] input[type=password]'),'malaclave'); document.querySelector('[role=dialog] form').requestSubmit(); 'enviada'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Contraseña incorrecta')" 6 || fail "no rechazó la mala"
echo "rechazada ✓" | tee -a "$LOG"

step "4. Contraseña correcta"
$AB eval "$SETVAL SV(document.querySelector('[role=dialog] input[type=password]'),'axsa11'); document.querySelector('[role=dialog] form').requestSubmit(); 'enviada'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('CONFIGURAR ACCESO')" || fail "no pidió token"
echo "autenticado ✓" | tee -a "$LOG"

step "5. Token (desde el remote)"
TOKEN=$(git remote get-url origin | sed -E 's|https://([^@]+)@.*|\1|')
$AB eval "window.__tok = '$TOKEN'; 'listo'" >/dev/null 2>&1
$AB eval "$SETVAL SV(document.querySelector('[role=dialog] input[type=password]'), window.__tok); window.__tok=null; document.querySelector('[role=dialog] form').requestSubmit(); 'token enviado'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('GESTOR DE JUEGOS')" || fail "no entró al gestor"
echo "gestor listo ✓" | tee -a "$LOG"

step "6. Llenar formulario"
FILL="(async()=>{
  $SETVAL
  SV(document.getElementById('dev-name'),'Juego de Prueba Ñandú');
  SV(document.getElementById('dev-desc'),'Prueba del panel con acentos áéíóú ñ. Será eliminada enseguida.');
  SV(document.getElementById('dev-link'),'https://example.com/');
  const r = await fetch('$URL'+'games/apex-kart.png');
  const b = await r.blob();
  const f = new File([b],'cover.png',{type:b.type});
  const dt = new DataTransfer();
  dt.items.add(f);
  const input = document.querySelector('[role=dialog] input[type=file]');
  input.files = dt.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
  return 'form llenado';
})()"
$AB eval "$FILL" >>"$LOG" 2>&1 || fail "no se pudo llenar"
espera_dom "!!document.querySelector('[role=dialog] img[alt=\"Vista previa de la portada\"]')" 12 || fail "sin preview"
echo "formulario listo ✓" | tee -a "$LOG"

step "7. Publicar (commits reales)"
$AB eval "document.querySelector('[role=dialog] form').requestSubmit(); 'publicando'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('¡Juego publicado!')" 30 || fail "no se publicó"
echo "subida exitosa ✓" | tee -a "$LOG"

step "8. Verificar en el repo"
git fetch origin main -q
git show origin/main:public/data/community-games.json | tee -a "$LOG" | grep -q "Juego de Prueba Ñandú" || fail "no está en el catálogo del repo"
echo "commit verificado ✓" | tee -a "$LOG"

step "9. Borrar juego de prueba"
$AB eval "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.getAttribute('aria-label')==='Eliminar Juego de Prueba Ñandú')?.click(); 'click eliminar'" >>"$LOG" 2>&1
espera_dom "[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.includes('¿Seguro?'))" 6 || fail "sin confirmación"
$AB eval "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('¿Seguro?'))?.click(); 'click seguro'" >>"$LOG" 2>&1
espera_dom "document.body.innerText.includes('Juego eliminado del catálogo')" 30 || fail "no se borró"
echo "borrado ✓" | tee -a "$LOG"

step "10. Repo limpio"
git fetch origin main -q
CAT=$(git show origin/main:public/data/community-games.json)
echo "$CAT" | tee -a "$LOG"
echo "$CAT" | grep -q "Ñandú" && fail "sigue en el repo" || echo "catálogo limpio ✓" | tee -a "$LOG"

step "11. Cerrar"
$AB press Escape >>"$LOG" 2>&1
echo "TODAS LAS PRUEBAS PASARON ✓" | tee -a "$LOG"
