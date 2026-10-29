// Genera las capturas PNG de evidencias/ con Chromium headless (Playwright).
// Uso (fuera del repo, para no agregar dependencias al servicio):
//   npm install playwright@1.48.2 && npx playwright install chromium
//   node capturar_evidencias.js /ruta/al/repo
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const path = require('path');

const REPO = process.argv[2];
const OUT = path.join(REPO, 'evidencias');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function correr(comando) {
  return execSync(comando, { cwd: REPO, shell: '/bin/bash', encoding: 'utf8' });
}

function terminalHtml(titulo, bloques) {
  const cuerpo = bloques
    .map(({ comando, salida }) =>
      `<div><span class="p">siccardi@TP3-GlobalLogistics %</span> <span class="c">${esc(comando)}</span></div>` +
      `<pre>${esc(salida)}</pre>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#1e1e1e;font:13px/1.45 Menlo,Consolas,monospace;color:#d4d4d4}
    .bar{background:#3a3a3a;color:#bbb;padding:6px 12px;font:12px -apple-system,sans-serif}
    .bar b{color:#fff}
    .t{padding:12px 14px}
    pre{margin:0 0 10px;white-space:pre;font:inherit}
    .p{color:#6a9955}.c{color:#fff;font-weight:bold}
  </style></head><body>
  <div class="bar"><b>${esc(titulo)}</b> — ${new Date().toISOString()} — salida real capturada en vivo</div>
  <div class="t">${cuerpo}</div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 120 }, deviceScaleFactor: 2 });

  async function capturarTerminal(archivo, titulo, comandos) {
    const bloques = comandos.map((comando) => ({ comando, salida: correr(comando) }));
    await page.setContent(terminalHtml(titulo, bloques));
    await page.screenshot({ path: path.join(OUT, archivo), fullPage: true });
    console.log('ok', archivo);
  }

  await capturarTerminal('captura_01_docker_compose_ps.png', 'docker compose ps', [
    'docker compose ps',
  ]);

  await capturarTerminal('captura_02_api_instancia_consecutivas.png', 'Solicitudes consecutivas a /api/instancia', [
    'for i in $(seq 1 9); do curl -s http://localhost:8080/api/instancia; echo; done',
    'for i in $(seq 1 9); do curl -s http://localhost:8080/api/instancia | grep -o \'"instancia":"[^"]*","contenedor_id":"[^"]*"\'; done',
  ]);

  // Mismo endpoint abierto en el navegador: tres cargas consecutivas.
  const nav = await browser.newPage({ viewport: { width: 1100, height: 120 }, deviceScaleFactor: 2 });
  for (let i = 1; i <= 3; i++) {
    await nav.goto('http://localhost:8080/api/instancia');
    const body = JSON.parse(await nav.innerText('body'));
    const archivo = `captura_03_navegador_api_instancia_${i}_${body.instancia}.png`;
    await nav.evaluate((n) => {
      // Oculta la barra "Pretty-print" del visor JSON de Chrome; el JSON queda tal cual.
      const pre = document.querySelector('pre');
      for (const el of [...document.body.children]) if (el !== pre) el.style.display = 'none';
      const h = document.createElement('div');
      h.textContent = `GET http://localhost:8080/api/instancia — carga ${n} de 3 — ${new Date().toISOString()}`;
      h.style.cssText = 'font:bold 14px sans-serif;padding:8px;background:#eef;margin-bottom:8px';
      document.body.insertBefore(h, document.body.firstChild);
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;font:14px monospace;padding:0 8px';
    }, i);
    await nav.screenshot({ path: path.join(OUT, archivo), fullPage: true });
    console.log('ok', archivo);
  }

  await browser.close();
})();
