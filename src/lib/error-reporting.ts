/**
 * Módulo de Observabilidad y Monitoreo de Errores para Producción.
 * Diseñado para integrarse transparentemente con Sentry (@sentry/react-native)
 * o Firebase Crashlytics.
 */

export interface ErrorReportContext {
  userId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

export function reportError(error: unknown, context?: ErrorReportContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  if (__DEV__) {
    console.error('[ErrorReport]', message, { context, stack });
    return;
  }

  // En producción, si Sentry u otro servicio está configurado:
  // Sentry.captureException(error, { extra: context });
}

export function reportWarning(message: string, metadata?: Record<string, unknown>): void {
  if (__DEV__) {
    console.warn('[ReportWarning]', message, metadata);
    return;
  }

  // En producción:
  // Sentry.captureMessage(message, { level: 'warning', extra: metadata });
}
