// Límite por ventana deslizante en memoria: como mucho `limite` usos por clave en `ventanaMs`.
// Sirve para gRPC, donde express-rate-limit no aplica. Al reiniciar el servidor se vacía.
export function crearLimitador({ limite, ventanaMs, ahora = Date.now }) {
  const usos = new Map();

  return {
    consumir(clave) {
      const momento = ahora();
      const recientes = (usos.get(clave) ?? []).filter((t) => momento - t < ventanaMs);
      if (recientes.length >= limite) {
        usos.set(clave, recientes);
        return false;
      }
      recientes.push(momento);
      usos.set(clave, recientes);
      return true;
    },
  };
}
