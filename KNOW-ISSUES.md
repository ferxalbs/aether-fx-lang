# KNOW-ISSUES — AETHER Fx v0

Estado de cierre: **implementación corregida y paquetes preparados; aceptación hospedada FAIL; publicación pendiente**. Trabajo detenido por solicitud del usuario. No se inició otra suite ni otra ronda de cambios para este cierre.

Commit ejecutado en CI: `3c589a9aa3777d3fadc831ed7c2e34cd26016876`.
Run: https://github.com/ferxalbs/aether-fx-lang/actions/runs/38110114744

## Bloqueos técnicos actuales

### 1. Next: Play no supera el frame 97 antes de Pause — ABIERTO

Los jobs `acceptance (22.12.0)` y `acceptance (24.21.0)` terminaron en FAILURE. En cada uno, nueve comandos PASS y el décimo FAIL; cinco comandos posteriores no ejecutados.

Comando fallido: `node scripts/verify-react-next.mjs artifacts/ci-next artifacts/metadata-packages`.
Aserción: `scripts/verify-react-next.mjs:56`, Play → espera fija de 180 ms → Pause → frame seleccionado debe ser mayor que 97. No se cumplió. La comparación exacta del PNG del frame 97 sí pasó. Los diagnósticos no registran errores de consola ni peticiones fallidas.

**Causa no establecida.** El estado/reloj y la latencia de `AudioContext.resume()` de esta ejecución Next no fueron capturados. La demora de arranque de audio observada en Firefox sugiere una hipótesis de entorno, pero no demuestra la causa de Next ni descarta un problema del producto. Para otra sesión: reproducir únicamente este consumidor y capturar reloj, resume, Play/Pause y frame; corregir según la evidencia, sin convertir la espera o el criterio en una forma de forzar PASS.

Evidencia: `artifacts/ci/hosted-audio-diagnosis/failed-jobs.log` y `download/acceptance-node-{22.12.0,24.21.0}/ci-next/next-run-diagnostic.json`; matrices completas hasta el fallo en sus carpetas `ci/acceptance-report.json`.

### 2. Aceptación hospedada incompleta — ABIERTO

Este run no llegó a ejecutar la matriz completa Chromium/Firefox/WebKit, migración de scope, memoria de exportación Node, memoria de exportación nativa ni benchmark del preview visible. El paso hospedado de preparación de release también se omitió. El diagnóstico aislado Firefox PASS no equivale a la matriz completa.

La aceptación local previa tras corregir el cuello completó los quince comandos PASS (`artifacts/final-acceptance/local/acceptance-report.json`, commit `1baab1c`). Se hicieron después verificaciones locales específicas del metadata, Next y Firefox. No se ejecutó una nueva suite local completa sobre `3c589a9`; los informes locales no sustituyen CI sobre ese commit.

### 3. Intermitencia histórica del preview en macOS — ABIERTA

Un intento perdió tres frames con un intervalo RAF de 160.2 ms; otro agotó 30 segundos en el tercer Play. El timeout antiguo no conservó estado suficiente para atribuir la causa. Ejecuciones posteriores locales pasaron tres Plays de 480 draws sin drops, p95 1.9 ms. Esos PASS **no explican** la intermitencia. No se atribuye al audio de Linux.

Conservados: `artifacts/ci/failed-preview`, `artifacts/ci/timeout-preview`, `artifacts/ci/preview-diagnosis.json` y la instrumentación actual de reloj/audio/RAF/controles/visibilidad y snapshots de timeout. Próxima investigación, si reaparece: conservar estado y reproducir solo el benchmark afectado. No se relajaron los criterios.

## Causas confirmadas y correcciones verificadas

- **Cabeza–torso:** puente de cuello añadido en el generador, fixture y ambos WebM regenerados. Frames 0/97/144/174/204/274/384/479 conectados; prueba de 198 píxeles por frame PASS y control negativo sin cuello detectado. Imágenes extraídas del WebM corregido: `artifacts/short/video-contact-sheet.png`; informe `artifacts/short/head-torso-report.json`.
- **Firefox del runner sin salida de audio:** baseline capturó frame 97, reloj cero y resume sin resolver. Tras configurar PulseAudio con sink virtual, el mismo verificador aislado avanzó y exportó/decodificó el corto real: PASS en ambos jobs. Evidencia antes/después: `ci-firefox-baseline`, `ci-audio`, `ci-firefox-audio` dentro del download del run actual. Es una causa del entorno confirmada para ese incidente Firefox; no prueba la causa de Next o del preview histórico.
- **PNG Next diferente:** comparación A/B confirmó full Chromium idéntico al renderer offline y headless shell con 3041 píxeles diferentes en Linux. Se usa el mismo full Chromium y se conserva igualdad PNG exacta. Evidencia `artifacts/ci/hosted-browser-diagnosis` y `artifacts/final-acceptance/hosted-next-cause.json`.
- **URL de checkout:** el verificador acepta las formas equivalentes del remoto real con/sin `.git`, y rechaza otro repositorio. Evidencia `artifacts/final-acceptance/repository-regression.json`.

## Paquetes preparados y publicación pendiente

Los siete paquetes `@aether-fx/{core,compiler,canvas,react,export,node,cli}` versión 0.1.0 fueron reconstruidos y empaquetados sobre `3c589a9`. Se entregan en `artifacts/release`, con `SHA256SUMS` y `manifest.json`. Los bytes de las bibliotecas no cambiaron: la corrección está en el generador/fixture, fuera de los tarballs. Los hashes iguales no indican que se haya omitido la reconstrucción.

Originales: Apache-2.0, NOTICE exacto `Copyright 2026  Fer's`; se preservan licencias y avisos de terceros. Remoto real: https://github.com/ferxalbs/aether-fx-lang.git.

**Publicación bloqueada e intencionalmente pendiente:** identidad `ferxalb` autenticada no acredita control de `@aether-fx`; consulta de organización E404 no demuestra disponibilidad ni propiedad. Falta verificar permisos de scope/paquetes y configurar bootstrap y trusted publisher/OIDC. `publicationReady=false`. No se publicó en npm.

## Limitaciones de cobertura

- Dispositivos móviles físicos, pantalla/altavoces físicos y su latencia: no verificados. El sink virtual de CI solo cubre la ejecución automatizada.
- MP4 opcional: no verificado; los entregables aceptados localmente son WebM VP9/Opus 720p y 1080p, 480 frames/20 s, 960000 muestras de audio y error máximo de alineación 0.0834 ms.
- Exportaciones nativas del navegador conservan la cola Opus medida de 648 muestras. El diagnóstico EOF de FFmpeg se conserva junto con cero errores de decodificación; no se usó para modificar criterios.
- Los informes de cierre están sin commit para no disparar otra CI. El manifest identifica el commit base y el árbol local con documentación de cierre. Archivos ajenos preexistentes no fueron alterados.

## Qué impide cerrar v0

Falta resolver o atribuir con evidencia el fallo Next y completar la aceptación hospedada sobre la versión corregida. La intermitencia histórica continúa como riesgo abierto. La configuración npm queda separada y pendiente; preparar paquetes no significa autorización ni preparación completa para publicarlos.
