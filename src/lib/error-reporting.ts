/**
 * Módulo de reporte y registro de errores de la aplicación.
 * Opera en modo local con funciones seguras sin dependencias externas.
 */

export interface ErrorReportContext {
  userId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

export function initErrorReporting(): void {
  // No-op: inicialización limpia sin SDKs externos
}

export function reportError(error: unknown, context?: ErrorReportContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  if (__DEV__) {
    console.error('[ErrorReport]', message, { context, stack });
  }
}

export function reportWarning(message: string, metadata?: Record<string, unknown>): void {
  if (__DEV__) {
    console.warn('[ReportWarning]', message, metadata);
  }
}
