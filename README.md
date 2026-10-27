# Hollow Pines

Survival horror FPS nocturno contra hordas infinitas en un bosque: solo tienes la linterna acoplada a tu arma (rifle, pistola y cuchillo táctico). Cliente puro (sin backend), PWA instalable, funciona offline tras la primera carga.
Stack: Vite 7 + TypeScript + Three.js (WebGL2) + vite-plugin-pwa (Workbox).

## Uso
```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # sirve dist/ para probar PWA/offline (el SW solo se registra en build)
```

## Despliegue en Vercel
1. Sube el repo a GitHub y en Vercel elige **Add New > Project**. `vercel.json` ya fija framework Vite, `npm run build` y `dist`.
2. O por CLI: `npx vercel --prod`. No hay variables de entorno ni secretos.
3. Vercel sirve HTTPS; `sw.js` va con `no-cache` y el manifest con su `Content-Type` (ver `vercel.json`).

## Estructura
`src/config.ts` (balance, calidad y `CFG.night` / `CFG.light` para ajustar la oscuridad y la linterna) · `world.ts` (cielo nocturno, luna, terreno, árboles procedurales, cementerio, colisiones) · `tex.ts` (texturas procedurales) · `light.ts` (linterna, haz volumétrico, polvo y niebla) · `post.ts` (bloom, grano, viñeta, gradación) · `player.ts` · `input.ts` (teclado/ratón/táctil) · `weapons.ts` · `zombies.ts` (dos diseños procedurales: caminante con traje y ghoul encorvado; pool, IA, `Horde`) · `fx.ts` (partículas en pool) · `audio.ts` (WebAudio procedural) · `perf.ts` (calidad adaptativa) · `store.ts` (localStorage) · `ui.ts` · `main.ts` (bucle y estados).

## Cómo funciona lo importante
- **Hordas infinitas, entidades acotadas:** 120/90/60/36 zombies simultáneos máx. (Ultra/High/Medium/Low), reutilizados desde un pool fijo. El objetivo crece con una curva suave en `CFG.horde`; `Perf` reduce resolución y luego el tope si el FPS cae < 42 durante 3 s.
- **Fin de partida:** solo `player.hp <= 0`.
- **Audio:** sin archivos; todo se sintetiza (viento, grillos, búho, latido con poca vida), los gruñidos son posicionales (HRTF).
- **Estética:** noche cerrada con niebla densa; la única luz propia es la linterna del arma equipada (tecla F la apaga/enciende). Ultra/High usan sombras de linterna y luna, bloom y grano; Low renderiza directo sin postproceso.
- **Si se ve demasiado oscuro/claro:** `CFG.night.exposure`, `CFG.night.fog` y `CFG.light.power` en `config.ts`.
- **Assets propios:** no se requieren. Para texturas PBR/modelos glTF, colócalos en `public/` y añade su extensión a `workbox.globPatterns` en `vite.config.ts`.

## Checklist de pruebas
- [ ] `npm install && npm run build` sin errores.
- [ ] Escritorio: WASD, Shift, C, Espacio, 1/2/3, R, clic = disparar, Esc = pausa.
- [ ] Móvil (landscape): joystick, arrastre para mirar, botones Fire/Jump/Reload/Swap/Crouch; en vertical aparece el aviso de girar.
- [ ] `npm run preview`, DevTools > Application: manifest válido, SW activo, "Install" disponible.
- [ ] Network "Offline" + recargar: el juego arranca y se juega.
- [ ] Partida de 15+ min: la memoria (Performance Monitor) se mantiene estable.
- [ ] Forzar WebGL2 sin GPU (flag del navegador): calidad cae a Low automáticamente.

## Enemigos (mecánicas de Resident Evil remake, GameCube)
- **Zombie**: lento, aguanta mucho. Si no muere de un disparo a la cabeza, **resucita como Crimson Head** (~25 s) salvo que destruyas su cabeza en el suelo (disparo o cuchillo). Antes de levantarse tiembla y le brillan los ojos.
- **Crimson Head**: piel desollada, más rápido y con más daño; no vuelve a resucitar.
- **Cerberus (perro)**: el enemigo más rápido, poca vida, aparece en manadas de 2-3.
- **Tyrant**: tanque con una garra enorme; muy resistente y de golpe fuerte.
- **Lisa Trevor**: jefe final. Aparece cada 6 minutos (uno a la vez, cada vez más fuerte) con barra de vida arriba.
Todo se ajusta en `ZOMBIES` (`src/config.ts`) y el reparto en `Horde.pick()` (`src/zombies.ts`).
