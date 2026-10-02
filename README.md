# Hollow Pines

Survival FPS contra hordas infinitas de zombies en un bosque. Cliente puro (sin backend), PWA instalable, funciona offline tras la primera carga.
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
`src/config.ts` (todos los valores de balance y calidad) · `world.ts` (terreno, vegetación instanciada, cielo, colisiones) · `player.ts` · `input.ts` (teclado/ratón/táctil) · `weapons.ts` · `zombies.ts` (pool, IA, `Horde`) · `fx.ts` (partículas en pool) · `audio.ts` (WebAudio procedural) · `perf.ts` (calidad adaptativa) · `store.ts` (localStorage) · `ui.ts` · `main.ts` (bucle y estados).

## Cómo funciona lo importante
- **Hordas infinitas, entidades acotadas:** 120/90/60/36 zombies simultáneos máx. (Ultra/High/Medium/Low), reutilizados desde un pool fijo. El objetivo crece con una curva suave en `CFG.horde`; `Perf` reduce resolución y luego el tope si el FPS cae < 42 durante 3 s.
- **Fin de partida:** solo `player.hp <= 0`.
- **Audio:** sin archivos; todo se sintetiza, los gruñidos son posicionales (HRTF).
- **Assets propios:** no se requieren. Para texturas PBR/modelos glTF, colócalos en `public/` y añade su extensión a `workbox.globPatterns` en `vite.config.ts`.

## Checklist de pruebas
- [ ] `npm install && npm run build` sin errores.
- [ ] Escritorio: WASD, Shift, C, Espacio, 1/2/3, R, clic = disparar, Esc = pausa.
- [ ] Móvil (landscape): joystick, arrastre para mirar, botones Fire/Jump/Reload/Swap/Crouch; en vertical aparece el aviso de girar.
- [ ] `npm run preview`, DevTools > Application: manifest válido, SW activo, "Install" disponible.
- [ ] Network "Offline" + recargar: el juego arranca y se juega.
- [ ] Partida de 15+ min: la memoria (Performance Monitor) se mantiene estable.
- [ ] Forzar WebGL2 sin GPU (flag del navegador): calidad cae a Low automáticamente.
