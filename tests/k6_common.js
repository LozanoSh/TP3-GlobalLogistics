import http from 'k6/http';
import { check } from 'k6';

export const BASE = __ENV.BASE_URL || 'http://localhost:8080';
export const WORK = Number(__ENV.WORK || 100);
export const solicitud = {
  referenciaCliente: 'PED-2026-00418',
  remitente: { nombre: 'Empresa Ejemplo S.A.', pais: 'AR', direccion: 'Av. San Martin 1200, Mendoza', codigoPostal: '5500' },
  destinatario: { nombre: 'Comercio Ejemplo Ltda.', pais: 'CL', direccion: 'Av. Providencia 1500, Santiago', codigoPostal: '7500000' },
  paquete: { pesoKg: 2.5, descripcion: 'Repuestos mecanicos', valorDeclarado: { moneda: 'USD', montoMinor: 14500 } },
  servicio: 'EXPRESS',
};

export function validarEnvio() {
  const res = http.post(`${BASE}/envios/validar`, JSON.stringify(solicitud), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'envios_validar' },
    timeout: '15s',
  });
  let valido = false;
  let instancia = 'desconocida';
  try {
    const body = res.json();
    valido = body.valido === true;
    instancia = body.instancia || 'desconocida';
  } catch (_) {}
  check(res, {
    'HTTP 200': (r) => r.status === 200,
    'valido true': () => valido,
    'instancia reconocida': () => ['api1', 'api2', 'api3'].includes(instancia),
  });
  return { res, valido, instancia };
}

export function cargaCpu() {
  const res = http.get(`${BASE}/api/cpu?work=${WORK}`, { tags: { endpoint: 'api_cpu', work: String(WORK) }, timeout: '40s' });
  let instancia = 'desconocida';
  let correcto = false;
  try {
    const body = res.json();
    instancia = body.instancia || 'desconocida';
    correcto = body.work === WORK && Number(body.iteraciones) === WORK * 100000;
  } catch (_) {}
  check(res, {
    'HTTP 200': (r) => r.status === 200,
    'work e iteraciones correctos': () => correcto,
    'instancia reconocida': () => ['api1', 'api2', 'api3'].includes(instancia),
  });
  return { res, instancia };
}
