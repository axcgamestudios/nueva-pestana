#!/usr/bin/env bash
# E2E: rediseño premium + chat con entrega offline (bandeja en la nube).
# Sesión A (default) y sesión B (--session b) de agent-browser.
set -u
URL="http://localhost:3000/"
AB="agent-browser"
ABB="$AB --session b"
PASS="clave123"
RAND="$RANDOM"
A_USER="desa$RAND"
B_USER="desb$RAND"
LOG=/tmp/e2e-premium.log
: >"$LOG"

step() { echo "" | tee -a "$LOG"; echo "=== $1 ===" | tee -a "$LOG"; }
fail() { echo "FALLO: $1" | tee -a "$LOG"; exit 1; }
espera() { # espera <sesion-cmd> <cond-js> <intentos> <descr>
  local ABX="$1" cond="$2" tries="${3:-10}" d="$4"
  for i in $(seq 1 "$tries"); do
    if $ABX eval "$cond" 2>>"$LOG" | rg -q true; then echo "ok: $d" | tee -a "$LOG"; return 0; fi
    sleep 2
  done
  fail "$d (timeout)"
}
SETVAL="var SV=(el,v)=>{const P=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};"

# abrir pantalla de auth (tab Crear cuenta) en la sesión dada
abrir_auth_registro() {
  local ABX="$1"
  $ABX eval "localStorage.clear(); 'limpio'" >>"$LOG" 2>&1
  $ABX open "$URL" >>"$LOG" 2>&1
  $ABX wait --load networkidle >>"$LOG" 2>&1
  espera "$ABX" "Array.from(document.querySelectorAll('header a,header button')).some(b=>b.textContent.trim()==='Entrar')" 8 "header Entrar visible"
  $ABX eval "Array.from(document.querySelectorAll('header a,header button')).find(b=>b.textContent.trim()==='Entrar')?.click(); 'ok'" >>"$LOG" 2>&1
  espera "$ABX" "document.body.innerText.includes('Bienvenido de nuevo')" 8 "pantalla de login abierta"
  $ABX eval "Array.from(document.querySelectorAll('[role=tab]')).find(t=>t.textContent.includes('Crear cuenta'))?.click(); 'ok'" >>"$LOG" 2>&1
  espera "$ABX" "document.getElementById('axc-displayname')!==null" 8 "formulario de registro visible"
}

registrar() { # registrar <sesion> <username>
  local ABX="$1" U="$2"
  abrir_auth_registro "$ABX"
  $ABX eval "$SETVAL SV(document.getElementById('axc-username'),'$U'); SV(document.getElementById('axc-displayname'),'$U'); SV(document.getElementById('axc-password'),'$PASS'); 'ok'" >>"$LOG" 2>&1
  $ABX eval "$SETVAL document.getElementById('axc-username').value==='$U' && document.getElementById('axc-password').value==='$PASS'" >>"$LOG" 2>&1
  $ABX eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
  espera "$ABX" "Array.from(document.querySelectorAll('input')).some(i=>(i.getAttribute('placeholder')||'').includes('Buscar chat'))" 18 "registro de $U completado"
}

login() { # login <sesion> <username>
  local ABX="$1" U="$2"
  $ABX eval "localStorage.removeItem('axcg:session'); 'salido'" >>"$LOG" 2>&1
  $ABX open "$URL" >>"$LOG" 2>&1
  $ABX wait --load networkidle >>"$LOG" 2>&1
  espera "$ABX" "Array.from(document.querySelectorAll('header a,header button')).some(b=>b.textContent.trim()==='Entrar')" 10 "header Entrar visible (login)"
  $ABX eval "Array.from(document.querySelectorAll('header a,header button')).find(b=>b.textContent.trim()==='Entrar')?.click(); 'ok'" >>"$LOG" 2>&1
  espera "$ABX" "document.getElementById('axc-username')!==null" 8 "form login visible"
  $ABX eval "$SETVAL SV(document.getElementById('axc-username'),'$U'); SV(document.getElementById('axc-password'),'$PASS'); 'ok'" >>"$LOG" 2>&1
  $ABX eval "document.querySelector('form button[type=submit]').click(); 'enviado'" >>"$LOG" 2>&1
}

# ir a la vista de chat sin alternar (el botón Chat es un toggle)
ir_chat() {
  local ABX="$1"
  espera "$ABX" "document.body.innerText.toUpperCase().includes('MENSAJES DIRECTOS') || document.body.innerText.toUpperCase().includes('AMIGOS')" 15 "vista de chat activa"
}

# ---------------------------------------------------------------- 0) Diseño
step "D0. Diseño premium: fondo negro, tipografía, azul"
$AB eval "localStorage.clear(); 'limpio'" >>"$LOG" 2>&1
$AB open "$URL" >>"$LOG" 2>&1
$AB wait --load networkidle >>"$LOG" 2>&1
sleep 2
$AB eval "getComputedStyle(document.body).backgroundColor==='rgb(0, 0, 0)'" >>"$LOG" 2>&1 || fail "fondo no es negro"
$AB eval "document.querySelector('h1') && getComputedStyle(document.querySelector('h1')).fontFamily.includes('Unbounded')" >>"$LOG" 2>&1 || fail "h1 no usa Unbounded"
$AB eval "document.querySelectorAll('[class*=blue-4],[class*=blue-5]').length>50" >>"$LOG" 2>&1 || fail "faltan acentos azules"
$AB screenshot /tmp/e2e-home.png >>"$LOG" 2>&1
echo "ok: diseño premium verificado (negro + Unbounded + azul) — captura /tmp/e2e-home.png" | tee -a "$LOG"

# ------------------------------------------------- A) registra cuenta B y sale
step "A1. Registrar cuenta B ($B_USER) y cerrar sesión"
registrar "$ABB" "$B_USER"
B_UID=$($ABB eval "JSON.parse(localStorage.getItem('axcg:accounts')||'{}')[localStorage.getItem('axcg:session')]?.user?.id || 'noid'" 2>/dev/null | tr -d '\r\n"')
echo "B uid=$B_UID" | tee -a "$LOG"
[ "$B_UID" != "noid" ] && [ -n "$B_UID" ] || fail "sin uid de B"
$ABB eval "localStorage.removeItem('axcg:session'); 'salido'" >>"$LOG" 2>&1
$ABB open "$URL" >>"$LOG" 2>&1
$ABB wait --load networkidle >>"$LOG" 2>&1

# ------------------------------------- B) registra A y agrega a B SIN conexión
step "A2. Registrar cuenta A ($A_USER)"
registrar "$AB" "$A_USER"
A_UID=$($AB eval "JSON.parse(localStorage.getItem('axcg:accounts')||'{}')[localStorage.getItem('axcg:session')]?.user?.id || 'noid'" 2>/dev/null | tr -d '\r\n"')
echo "A uid=$A_UID" | tee -a "$LOG"
[ "$A_UID" != "noid" ] && [ -n "$A_UID" ] || fail "sin uid de A"

step "A3. A añade a B (B desconectado) → debe funcionar"
ir_chat "$AB"
$AB eval "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith('Amigos'))?.click(); 'ok'" >>"$LOG" 2>&1
espera "$AB" "document.body.innerText.includes('Añadir amigo')" 8 "panel de amigos abierto"
$AB eval "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Añadir amigo'))?.click(); 'ok'" >>"$LOG" 2>&1
espera "$AB" "document.getElementById('add-friend-input')!==null" 8 "form de añadir visible"
$AB eval "$SETVAL SV(document.getElementById('add-friend-input'),'$B_USER'); 'ok'" >>"$LOG" 2>&1
$AB eval "document.getElementById('add-friend-input')?.value==='$B_USER'" >>"$LOG" 2>&1 || fail "no se pudo escribir el usuario"
$AB eval "document.querySelector('form button[type=submit]').click(); 'ok'" >>"$LOG" 2>&1
espera "$AB" "document.body.innerText.includes('La verá aunque no esté conectado')" 12 "solicitud enviada a B (offline)"
$AB screenshot /tmp/e2e-addfriend.png >>"$LOG" 2>&1

# ------------------------------------------------- C) B entra y acepta
step "A4. B inicia sesión → le llega la solicitud por la nube"
login "$ABB" "$B_USER"
ir_chat "$ABB"
$ABB eval "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith('Amigos'))?.click(); 'ok'" >>"$LOG" 2>&1
espera "$ABB" "document.body.innerText.includes('Añadir amigo')" 8 "panel de amigos abierto (B)"
$ABB eval "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Pendientes'))?.click(); 'ok'" >>"$LOG" 2>&1
espera "$ABB" "document.body.innerText.includes('quiere ser tu amigo')" 18 "B ve la solicitud de A"
$ABB eval "Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||'').includes('Aceptar'))?.click(); 'aceptado'" >>"$LOG" 2>&1
espera "$ABB" "document.body.innerText.includes('Todos (1)')" 8 "B aceptó: 1 amigo"
$ABB screenshot /tmp/e2e-friends-b.png >>"$LOG" 2>&1

# A también debe tener a B (friend-accept vía nube)
step "A5. A recibe la aceptación por la nube"
espera "$AB" "document.body.innerText.includes('Todos (1)')" 18 "A ve a B como amigo"

# ------------------------------------------------- D) mensaje offline
step "A6. B cierra sesión; A le escribe un mensaje"
$ABB eval "localStorage.removeItem('axcg:session'); 'salido'" >>"$LOG" 2>&1
$ABB open "$URL" >>"$LOG" 2>&1
$ABB wait --load networkidle >>"$LOG" 2>&1

MSG="hola desde la nueva pagina $RAND"
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('$B_USER')&&x.textContent.length<40); b?.click(); return b?'conv':'nofound'})()" >>"$LOG" 2>&1
espera "$AB" "document.querySelector('textarea')!==null" 8 "abrió el chat con B"
$AB eval "$SETVAL const ti=document.querySelector('textarea'); ti?SV(ti,'$MSG'):'noinput'; 'ok'" >>"$LOG" 2>&1
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.getAttribute('aria-label')==='Enviar mensaje'); b?.click(); return b?'sent':'nobtn'})()" >>"$LOG" 2>&1
espera "$AB" "document.querySelector('textarea')?.value==='' && document.body.innerText.includes('$MSG')" 8 "mensaje visible para A"

step "A7. B inicia sesión → le llega el mensaje por la nube (≤20s de poll)"
login "$ABB" "$B_USER"
ir_chat "$ABB"
espera "$ABB" "document.body.innerText.includes('$MSG')" 22 "B recibió el mensaje offline"
$ABB screenshot /tmp/e2e-msg-b.png >>"$LOG" 2>&1

echo "" | tee -a "$LOG"
echo "TODO OK — diseño + amistad offline + mensaje offline verificados" | tee -a "$LOG"
echo "A=$A_USER ($A_UID)  B=$B_USER ($B_UID)" | tee -a "$LOG"
