'use strict';

// Reglas de CrearEnvioRequest en el OpenAPI del TP2. Esta validación no crea envíos.
function validarEnvio(solicitud) {
  const errores = [];

  function objeto(valor, campo, permitidos, obligatorios) {
    if (valor === undefined) {
      errores.push({ campo, detalle: 'es obligatorio' });
      return false;
    }
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
      errores.push({ campo, detalle: 'debe ser un objeto' });
      return false;
    }
    for (const nombre of obligatorios) {
      if (!Object.hasOwn(valor, nombre)) {
        errores.push({ campo: campo === 'solicitud' ? nombre : `${campo}.${nombre}`, detalle: 'es obligatorio' });
      }
    }
    for (const nombre of Object.keys(valor)) {
      if (!permitidos.includes(nombre)) {
        errores.push({ campo: `${campo}.${nombre}`, detalle: 'campo no permitido' });
      }
    }
    return true;
  }

  function cadena(valor, campo, minimo, maximo, patron) {
    if (valor === undefined) return;
    if (typeof valor !== 'string') {
      errores.push({ campo, detalle: 'debe ser una cadena' });
      return;
    }
    const longitud = Array.from(valor).length;
    if (longitud < minimo || longitud > maximo) {
      errores.push({ campo, detalle: `debe tener entre ${minimo} y ${maximo} caracteres` });
    } else if (patron && !patron.test(valor)) {
      errores.push({ campo, detalle: 'formato inválido' });
    }
  }

  const camposRaiz = ['referenciaCliente', 'remitente', 'destinatario', 'paquete', 'servicio'];
  if (!objeto(solicitud, 'solicitud', camposRaiz, ['remitente', 'destinatario', 'paquete', 'servicio'])) {
    return errores;
  }

  cadena(solicitud.referenciaCliente, 'referenciaCliente', 1, 64);

  for (const parte of ['remitente', 'destinatario']) {
    if (!Object.hasOwn(solicitud, parte)) continue;
    const direccion = solicitud[parte];
    const campos = ['nombre', 'pais', 'direccion', 'codigoPostal'];
    if (!objeto(direccion, parte, campos, campos)) continue;
    cadena(direccion.nombre, `${parte}.nombre`, 2, 120);
    cadena(direccion.pais, `${parte}.pais`, 2, 2, /^[A-Z]{2}$/);
    cadena(direccion.direccion, `${parte}.direccion`, 5, 200);
    cadena(direccion.codigoPostal, `${parte}.codigoPostal`, 2, 20);
  }

  if (Object.hasOwn(solicitud, 'paquete') && objeto(solicitud.paquete, 'paquete', ['pesoKg', 'descripcion', 'valorDeclarado'], ['pesoKg', 'descripcion', 'valorDeclarado'])) {
    const paquete = solicitud.paquete;
    if (paquete.pesoKg !== undefined && (typeof paquete.pesoKg !== 'number' || !Number.isFinite(paquete.pesoKg) || paquete.pesoKg < 0.01 || paquete.pesoKg > 1000)) {
      errores.push({ campo: 'paquete.pesoKg', detalle: 'debe ser un número entre 0.01 y 1000' });
    }
    cadena(paquete.descripcion, 'paquete.descripcion', 3, 300);

    if (Object.hasOwn(paquete, 'valorDeclarado') && objeto(paquete.valorDeclarado, 'paquete.valorDeclarado', ['moneda', 'montoMinor'], ['moneda', 'montoMinor'])) {
      const valor = paquete.valorDeclarado;
      cadena(valor.moneda, 'paquete.valorDeclarado.moneda', 3, 3, /^[A-Z]{3}$/);
      const monto = valor.montoMinor;
      const montoValido = typeof monto === 'bigint'
        ? monto >= 1n && monto <= 9223372036854775807n
        : Number.isSafeInteger(monto) && monto >= 1;
      if (monto !== undefined && !montoValido) {
        errores.push({ campo: 'paquete.valorDeclarado.montoMinor', detalle: 'debe ser un entero positivo int64' });
      }
    }
  }

  if (solicitud.servicio !== undefined && !['ESTANDAR', 'EXPRESS'].includes(solicitud.servicio)) {
    errores.push({ campo: 'servicio', detalle: 'debe ser ESTANDAR o EXPRESS' });
  }

  return errores;
}

module.exports = { validarEnvio };
