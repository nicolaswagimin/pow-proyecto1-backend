# 0001 · Connect para gRPC

**Estado:** aceptada · 2026-10-15

## Contexto

El curso exige gRPC en al menos un proyecto. El frontend es un navegador, que no puede hablar gRPC puro (necesita control de HTTP/2 y trailers). La opción clásica es `@grpc/grpc-js` en el servidor más un proxy Envoy que traduzca gRPC-Web a gRPC.

## Decisión

Usar [Connect](https://connectrpc.com) (`@connectrpc/connect-node` en el backend y `@connectrpc/connect-web` en el frontend), con código generado por Buf (`protoc-gen-es`).

## Consecuencias

- Un mismo manejador acepta gRPC, gRPC-Web y Connect: no hace falta Envoy ni un segundo servicio en Render.
- Se monta junto a Express en el mismo proceso, con Express como fallback para REST.
- Los tipos salen del `.proto` en los dos repos (TypeScript en el frontend, JS con `.d.ts` en el backend).
- Interceptores y errores (`ConnectError` con códigos gRPC) funcionan igual en cliente y servidor.
- A cambio, Connect es menos conocido que `grpc-js`, y gRPC puro solo se puede demostrar donde haya HTTP/2 de punta a punta (en local; ver 0003).
