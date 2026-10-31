'use strict';

// Validación funcional a través de Nginx; requiere docker compose up -d --build.
const assert = require('node:assert/strict');

const base = process.env.BASE ?? 'http://localhost:8080';
const solicitud = {
  referenciaCliente: 'PED-2026-00418',
  remitente: { nombre: 'Empresa Ejemplo S.A.', pais: 'AR', direccion: 'Av. San Martin 1200, Mendoza', codigoPostal: '5500' },
  destinatario: { nombre: 'Comercio Ejemplo Ltda.', pais: 'CL', direccion: 'Av. Providencia 1500, Santiago', codigoPostal: '7500000' },
  paquete: { pesoKg: 2.5, descripcion: 'Repuestos mecanicos', valorDeclarado: { moneda: 'USD', montoMinor: 14500 } },
  servicio: 'EXPRESS',
};

async function enviar(cuerpo) {
  return fetch(`${base}/envios/validar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

(async () => {
  const instancias = new Set();
  for (let i = 0; i < 9; i++) {
    const respuesta = await enviar(solicitud);
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.valido, true);
    assert.equal(cuerpo.servicio, 'Gestion de Envios');
    assert.match(cuerpo.contenedor_id, /^[0-9a-f]{64}$/);
    instancias.add(cuerpo.instancia);
    console.log(`POST valido ${i + 1}: ${cuerpo.instancia} ${cuerpo.contenedor_id}`);
  }
  assert.deepEqual([...instancias].sort(), ['api1', 'api2', 'api3']);

  for (const [nombre, cambiar] of [
    ['obligatorio faltante', x => { delete x.remitente; }],
    ['peso negativo', x => { x.paquete.pesoKg = -1; }],
    ['moneda invalida', x => { x.paquete.valorDeclarado.moneda = 'US'; }],
    ['importe invalido', x => { x.paquete.valorDeclarado.montoMinor = 0; }],
    ['servicio invalido', x => { x.servicio = 'PRIORITARIO'; }],
  ]) {
    const cuerpo = structuredClone(solicitud);
    cambiar(cuerpo);
    const respuesta = await enviar(cuerpo);
    assert.equal(respuesta.status, 400, nombre);
    console.log(`POST ${nombre}: 400`);
  }

  for (const ruta of ['/health', '/api/instancia', '/api/cpu?work=1']) {
    const respuesta = await fetch(`${base}${ruta}`);
    assert.equal(respuesta.status, 200, ruta);
    console.log(`GET ${ruta}: 200`);
  }
  console.log('VALIDACION ENVIOS OK: tres replicas y endpoints tecnicos');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
