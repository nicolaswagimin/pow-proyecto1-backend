# 0003 · Un puerto para HTTP/1.1 y HTTP/2

**Estado:** aceptada · 2026-10-15

## Contexto

gRPC puro necesita HTTP/2; el navegador (gRPC-Web) y REST usan HTTP/1.1. Node no tiene un servidor que acepte ambos sin TLS en el mismo puerto (`allowHTTP1` solo existe con TLS), y Render asigna un único puerto.

## Decisión

`src/servidor.js` crea un `net.Server` que lee el primer paquete de cada conexión. Si empieza con el prefacio de HTTP/2 (`PRI * HTTP/2.0`), entrega el socket a un `http2.Server`; si no, a un `http.Server`. Los dos usan el mismo manejador (Connect con Express como fallback).

## Consecuencias

- En local funcionan a la vez `curl` contra REST, `buf curl --protocol grpc --http2-prior-knowledge` y el navegador con gRPC-Web, todos en el puerto 3001.
- En Render, gRPC-Web y gRPC puro funcionan a través de su proxy HTTPS (verificado el 2026-10-16; ver `despliegue.md`).
- Son unas 30 líneas propias, probadas en `test/servidor.test.js` con un cliente HTTP/1.1 y otro HTTP/2.
