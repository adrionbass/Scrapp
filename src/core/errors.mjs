export class DomainError extends Error {
  constructor(code, userMessage, technicalMessage = userMessage, details = {}) {
    super(technicalMessage);
    this.name = "DomainError";
    this.code = code;
    this.userMessage = userMessage;
    this.technicalMessage = technicalMessage;
    this.details = details;
  }
}

export function invalidScratchUrl(input) {
  return new DomainError(
    "InvalidScratchUrl",
    "NO SE RECONOCIO EL PROYECTO DE SCRATCH",
    `Invalid Scratch project URL or ID: ${String(input)}`,
  );
}

export function invalidScratchProject(message, details = {}) {
  return new DomainError(
    "InvalidScratchProject",
    "NO SE PUDO LEER EL PROYECTO",
    message,
    details,
  );
}

export function exportFailed(message, details = {}) {
  return new DomainError(
    "ExportFailed",
    "NO SE PUDO CREAR LA APP",
    message,
    details,
  );
}
