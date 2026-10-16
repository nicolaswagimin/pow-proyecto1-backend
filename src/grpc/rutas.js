import { DiagramService } from '../gen/codetodiagram/v1/diagram_pb.js';

// Registra el servicio de diagramas. Los métodos que falten en impl responden "unimplemented".
export function rutasGrpc(impl) {
  return (router) => {
    router.service(DiagramService, impl);
  };
}
