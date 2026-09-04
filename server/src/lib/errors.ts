export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, message, details);
export const unauthorized = (message = 'Требуется авторизация') => new AppError(401, message);
export const notFound = (message = 'Не найдено') => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
