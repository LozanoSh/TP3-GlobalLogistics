'use strict';

const express = require('express');
const os = require('os');
const fs = require('fs');
const { validarEnvio } = require('./validarEnvio');

const SERVICIO = 'Gestion de Envios';
const VERSION = '1.0.0';

// Cada unidad de "work" equivale a esta cantidad de iteraciones del bucle de CPU.
const ITERACIONES_POR_UNIDAD = 100000;
const WORK_MIN = 1;
const WORK_MAX = Number.parseInt(process.env.CPU_WORK_MAX ?? '2000', 10);

// Conserva la precisión del monto int64 al parsear JSON (Node 22 expone
// el literal original en el reviver). El monto sólo se usa para validación.
function revivirMontoMinor(clave, valor, contexto) {
  if (clave !== 'montoMinor' || typeof valor !== 'number') return valor;
  const literal = contexto?.source;
  const partes = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal ?? '');
  if (!partes) return Number.isSafeInteger(valor) ? BigInt(valor) : NaN;

  const [, signo, entero, fraccion = '', exponente = '0'] = partes;
  let digitos = (entero + fraccion).replace(/^0+/, '') || '0';
  if (digitos === '0') return 0n;
  const desplazamiento = Number(exponente) - fraccion.length;
  if (!Number.isSafeInteger(desplazamiento)) return NaN;

  if (desplazamiento >= 0) {
    if (digitos.length + desplazamiento > 19) return NaN;
    digitos += '0'.repeat(desplazamiento);
  } else {
    const quitar = -desplazamiento;
    if (quitar > digitos.length || !/^0*$/.test(digitos.slice(-quitar))) return NaN;
    digitos = digitos.slice(0, -quitar) || '0';
  }
  return BigInt(`${signo}${digitos}`);
}

// Obtiene el ID real del contenedor Docker leyendo los montajes del proceso.
// Con `hostname:` fijado en Compose, /etc/hostname ya no contiene el ID,
// pero los montajes de /etc/hosts y /etc/resolv.conf siguen apuntando a
// /var/lib/docker/containers/<id>/.
function leerIdContenedor() {
  try {
    const mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    const coincidencia = mountinfo.match(/\/containers\/([0-9a-f]{64})\//);
    return coincidencia ? coincidencia[1] : null;
  } catch {
    return null;
  }
}

const identidad = {
  instancia: os.hostname(),
  contenedor_id: leerIdContenedor(),
  instance_id: process.env.INSTANCE_ID ?? null,
  pid: process.pid,
};

// Trabajo de CPU real y determinista: un generador xorshift32 iterado
// `unidades * ITERACIONES_POR_UNIDAD` veces. No usa esperas, E/S ni red.
function trabajoCpu(unidades) {
  let x = 2463534242;
  let acumulado = 0;
  const total = unidades * ITERACIONES_POR_UNIDAD;
  for (let i = 0; i < total; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    acumulado = (acumulado + (x >>> 0)) % 4294967291;
  }
  return { iteraciones: total, resultado: acumulado };
}

function parsearWork(valor) {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
    return null;
  }
  const numero = Number.parseInt(valor, 10);
  if (!Number.isSafeInteger(numero) || numero < WORK_MIN || numero > WORK_MAX) {
    return null;
  }
  return numero;
}

function crearApp(estado = { cerrando: false }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Instancia', identidad.instancia);
    next();
  });

  app.get('/health', (req, res) => {
    if (estado.cerrando) {
      return res.status(503).json({ estado: 'cerrando', instancia: identidad.instancia });
    }
    res.json({
      estado: 'ok',
      instancia: identidad.instancia,
      uptime_s: Math.round(process.uptime()),
    });
  });

  app.get('/api/instancia', (req, res) => {
    res.json({
      ...identidad,
      servicio: SERVICIO,
      version: VERSION,
      node: process.version,
      uptime_s: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/cpu', (req, res) => {
    const work = parsearWork(req.query.work);
    if (work === null) {
      return res.status(400).json({
        error: 'Parámetro "work" inválido',
        detalle: `Debe ser un entero entre ${WORK_MIN} y ${WORK_MAX}.`,
        recibido: req.query.work ?? null,
        instancia: identidad.instancia,
      });
    }

    const inicio = process.hrtime.bigint();
    const { iteraciones, resultado } = trabajoCpu(work);
    const duracionMs = Number(process.hrtime.bigint() - inicio) / 1e6;

    res.json({
      instancia: identidad.instancia,
      work,
      iteraciones,
      resultado,
      duracion_ms: Math.round(duracionMs * 100) / 100,
    });
  });

  app.post('/envios/validar', express.json({ strict: true, reviver: revivirMontoMinor }), (req, res) => {
    const errores = validarEnvio(req.body);
    if (errores.length > 0) {
      return res.status(400).json({ valido: false, errores, instancia: identidad.instancia });
    }

    res.json({
      valido: true,
      servicio: SERVICIO,
      tipoEnvio: req.body.servicio,
      origen: req.body.remitente.pais,
      destino: req.body.destinatario.pais,
      pesoKg: req.body.paquete.pesoKg,
      instancia: identidad.instancia,
      contenedor_id: identidad.contenedor_id,
    });
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({
        valido: false,
        errores: [{ campo: 'solicitud', detalle: 'JSON inválido' }],
        instancia: identidad.instancia,
      });
    }
    next(err);
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada', ruta: req.path, instancia: identidad.instancia });
  });

  return app;
}

module.exports = { crearApp, trabajoCpu, parsearWork, WORK_MIN, WORK_MAX, ITERACIONES_POR_UNIDAD };
