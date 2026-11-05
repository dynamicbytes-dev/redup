import { assertRateLimit, sanitizeText } from '@/lib/security';
import { supabase } from '@/lib/supabase';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate_content'
  | 'violence'
  | 'other';

export interface SubmitReportInput {
  reportedUserId?: string | null;
  contentType: 'user' | 'message' | 'status';
  contentId?: string | null;
  reason: ReportReason;
  details?: string;
}

export const REPORT_REASONS: { key: ReportReason; label: string; description: string }[] = [
  {
    key: 'harassment',
    label: 'Acoso o intimidación',
    description: 'Comportamiento hostil, insultos reiterados o amenazas directas.',
  },
  {
    key: 'inappropriate_content',
    label: 'Contenido inapropiado',
    description: 'Material sexual explícito, desnudez o contenido ofensivo.',
  },
  {
    key: 'spam',
    label: 'Spam o estafa',
    description: 'Mensajes masivos no deseados, suplantación o enlaces fraudulentos.',
  },
  {
    key: 'violence',
    label: 'Violencia o incitación al odio',
    description: 'Contenido que promueve violencia o discriminación.',
  },
  {
    key: 'other',
    label: 'Otro motivo',
    description: 'Cualquier otra infracción a las Normas de la Comunidad.',
  },
];

export async function submitReport(input: SubmitReportInput): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const reporterId = authData?.user?.id;
  if (!reporterId) {
    throw new Error('Debes iniciar sesión para enviar un reporte.');
  }

  // Rate limiting anti-abuso de reportes: máx 5 cada minuto
  assertRateLimit(
    `report:${reporterId}`,
    5,
    60_000,
    'Has enviado varios reportes recientemente. Espera un momento antes de enviar otro.',
  );

  const cleanDetails = input.details ? sanitizeText(input.details, 1000) : null;

  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: input.reportedUserId ?? null,
    content_type: input.contentType,
    content_id: input.contentId ?? null,
    reason: input.reason,
    details: cleanDetails,
  });

  if (error) {
    throw new Error('No pudimos procesar el reporte. Inténtalo más tarde.');
  }
}
