'use strict';

const os = require('os');
const { crearApp, WORK_MAX } = require('./app');

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const estado = { cerrando: false };
const app = crearApp(estado);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${os.hostname()}] escuchando en 0.0.0.0:${PORT} (CPU_WORK_MAX=${WORK_MAX})`);
});

// Apagado ordenado: /health pasa a 503 y se dejan de aceptar conexiones nuevas.
function apagar(senal) {
  if (estado.cerrando) return;
  estado.cerrando = true;
  console.log(`[${os.hostname()}] ${senal} recibido, cerrando`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
