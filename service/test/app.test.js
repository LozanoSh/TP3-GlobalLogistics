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
