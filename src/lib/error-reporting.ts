import * as Sentry from '@sentry/react-native';

/**
 * Módulo de Observabilidad y Monitoreo de Errores para Producción con Sentry.
 */

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

let isSentryInitialized = false;

export function initErrorReporting(): void {
  if (isSentryInitialized) return;

  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      enableAutoSessionTracking: true,
      tracesSampleRate: __DEV__ ? 1.0 : 0.2,
      debug: false,
    });
    isSentryInitialized = true;
  }
}

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

  if (isSentryInitialized) {
    Sentry.captureException(error, {
      extra: context as Record<string, unknown>,
    });
  }
}

export function reportWarning(message: string, metadata?: Record<string, unknown>): void {
  if (__DEV__) {
    console.warn('[ReportWarning]', message, metadata);
    return;
  }

  if (isSentryInitialized) {
    Sentry.captureMessage(message, {
      level: 'warning',
      extra: metadata,
    });
  }
}
