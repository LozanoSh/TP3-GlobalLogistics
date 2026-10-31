'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearApp, trabajoCpu, WORK_MAX } = require('../src/app');

let server;
let base;
const estado = { cerrando: false };

before(async () => {
  server = crearApp(estado).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('GET /health responde 200 con estado ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.estado, 'ok');
  assert.ok(body.instancia);
});

test('GET /health responde 503 durante el apagado', async () => {
  estado.cerrando = true;
  const res = await fetch(`${base}/health`);
  estado.cerrando = false;
  assert.equal(res.status, 503);
});

test('GET /api/instancia devuelve el hostname real', async () => {
  const res = await fetch(`${base}/api/instancia`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.equal(body.instancia, require('os').hostname());
  assert.equal(body.servicio, 'Gestion de Envios');
});

test('GET /api/cpu con work válido ejecuta trabajo', async () => {
  const res = await fetch(`${base}/api/cpu?work=5`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.work, 5);
  assert.equal(body.resultado, trabajoCpu(5).resultado);
});

for (const valor of ['', 'abc', '0', '-3', '1.5', '1e3', String(WORK_MAX + 1)]) {
  test(`GET /api/cpu?work=${valor} responde 400`, async () => {
    const res = await fetch(`${base}/api/cpu?work=${encodeURIComponent(valor)}`);
    assert.equal(res.status, 400);
  });
}

test('GET /api/cpu sin work responde 400', async () => {
  const res = await fetch(`${base}/api/cpu`);
  assert.equal(res.status, 400);
});

test('GET /api/cpu con work repetido responde 400', async () => {
  const res = await fetch(`${base}/api/cpu?work=1&work=2`);
  assert.equal(res.status, 400);
});

const envioValido = {
  referenciaCliente: 'PED-2026-00418',
  remitente: { nombre: 'Empresa Ejemplo S.A.', pais: 'AR', direccion: 'Av. San Martin 1200, Mendoza', codigoPostal: '5500' },
  destinatario: { nombre: 'Comercio Ejemplo Ltda.', pais: 'CL', direccion: 'Av. Providencia 1500, Santiago', codigoPostal: '7500000' },
  paquete: { pesoKg: 2.5, descripcion: 'Repuestos mecanicos', valorDeclarado: { moneda: 'USD', montoMinor: 14500 } },
  servicio: 'EXPRESS',
};

async function postEnvio(cuerpo) {
  return fetch(`${base}/envios/validar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

test('POST /envios/validar acepta la solicitud TP2 sin afirmar persistencia', async () => {
  const res = await postEnvio(envioValido);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.valido, true);
  assert.equal(body.servicio, 'Gestion de Envios');
  assert.equal(body.tipoEnvio, 'EXPRESS');
  assert.equal(body.origen, 'AR');
  assert.equal(body.destino, 'CL');
  assert.equal(body.pesoKg, 2.5);
  assert.equal(body.instancia, require('os').hostname());
  assert.ok(Object.hasOwn(body, 'contenedor_id'));
  assert.equal(Object.hasOwn(body, 'envioId'), false);
});

test('POST /envios/validar acepta importe int64 maximo sin redondeo', async () => {
  const cuerpo = JSON.stringify(envioValido).replace('"montoMinor":14500', '"montoMinor":9223372036854775807');
  const res = await fetch(`${base}/envios/validar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo,
  });
  assert.equal(res.status, 200);
});

test('POST /envios/validar rechaza importe superior a int64', async () => {
  const cuerpo = JSON.stringify(envioValido).replace('"montoMinor":14500', '"montoMinor":9223372036854775808');
  const res = await fetch(`${base}/envios/validar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo,
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.errores.some(error => error.campo === 'paquete.valorDeclarado.montoMinor'));
});

test('POST /envios/validar admite referencia opcional y servicio ESTANDAR', async () => {
  const solicitud = structuredClone(envioValido);
  delete solicitud.referenciaCliente;
  solicitud.servicio = 'ESTANDAR';
  const res = await postEnvio(solicitud);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).tipoEnvio, 'ESTANDAR');
});

for (const [nombre, cambiar, campo] of [
  ['obligatorio faltante', x => { delete x.remitente; }, 'remitente'],
  ['nombre demasiado corto', x => { x.destinatario.nombre = 'A'; }, 'destinatario.nombre'],
  ['pais invalido', x => { x.remitente.pais = 'arg'; }, 'remitente.pais'],
  ['peso negativo', x => { x.paquete.pesoKg = -1; }, 'paquete.pesoKg'],
  ['peso fuera de rango', x => { x.paquete.pesoKg = 1001; }, 'paquete.pesoKg'],
  ['moneda invalida', x => { x.paquete.valorDeclarado.moneda = 'US'; }, 'paquete.valorDeclarado.moneda'],
  ['importe invalido', x => { x.paquete.valorDeclarado.montoMinor = 0; }, 'paquete.valorDeclarado.montoMinor'],
  ['servicio invalido', x => { x.servicio = 'SAME_DAY'; }, 'servicio'],
  ['campo no permitido', x => { x.paquete.fragil = true; }, 'paquete.fragil'],
]) {
  test(`POST /envios/validar rechaza ${nombre}`, async () => {
    const solicitud = structuredClone(envioValido);
    cambiar(solicitud);
    const res = await postEnvio(solicitud);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.valido, false);
    assert.ok(body.errores.some(error => error.campo === campo));
  });
}

test('POST /envios/validar rechaza JSON invalido con 400', async () => {
  const res = await fetch(`${base}/envios/validar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"remitente":',
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.errores[0].detalle, 'JSON inválido');
});

test('POST /envios/validar informa una sola vez el objeto faltante', async () => {
  const solicitud = structuredClone(envioValido);
  delete solicitud.remitente;
  const res = await postEnvio(solicitud);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual(body.errores.filter(error => error.campo === 'remitente'), [
    { campo: 'remitente', detalle: 'es obligatorio' },
  ]);
});
