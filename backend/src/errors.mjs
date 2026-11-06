// Errores de dominio con código HTTP y código estable para el cliente.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);
export const notFound = (message = 'Recurso no encontrado') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code, message, details) => new AppError(409, code, message, details);
