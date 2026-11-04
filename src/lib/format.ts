import {
  differenceInCalendarDays,
  format,
  isSameDay,
  isThisYear,
  isToday,
  isYesterday,
} from 'date-fns';
import { es } from 'date-fns/locale';

import type { MessageKind } from './types';

export function formatListTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Ayer';
  const diff = differenceInCalendarDays(new Date(), date);
  if (diff < 7) return capitalize(format(date, 'EEEE', { locale: es }));
  if (isThisYear(date)) return format(date, 'd MMM', { locale: es });
  return format(date, 'dd/MM/yy');
}

export function formatMessageTime(iso: string): string {
  return format(new Date(iso), 'HH:mm');
}

export function formatDaySeparator(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return 'Hoy';
  if (isYesterday(date)) return 'Ayer';
  const diff = differenceInCalendarDays(new Date(), date);
  if (diff < 7) return capitalize(format(date, 'EEEE', { locale: es }));
  return capitalize(format(date, "d 'de' MMMM", { locale: es }));
}

export function isSameMessageDay(a: string, b: string): boolean {
  return isSameDay(new Date(a), new Date(b));
}

export function messagePreview(kind: MessageKind | string | null, body: string | null): string {
  switch (kind) {
    case 'image':
      return '📷 Foto';
    case 'audio':
      return '🎤 Nota de voz';
    case 'file':
      return '📎 Archivo';
    case 'deleted':
      return 'Mensaje eliminado';
    case 'system':
      return body ?? '';
    default:
      return body ?? '';
  }
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

const AVATAR_TINTS = [
  '#5B4BE8',
  '#FF6B5B',
  '#0E9F6E',
  '#D97706',
  '#0EA5E9',
  '#A855F7',
  '#DB2777',
  '#0F766E',
];

export function avatarTint(seed: string | null | undefined): string {
  if (!seed) return AVATAR_TINTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

export function relativeLastSeen(iso: string | null | undefined): string {
  if (!iso) return 'offline';
  const date = new Date(iso);
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 70) return 'en línea';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (isToday(date)) return `hoy a las ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `ayer a las ${format(date, 'HH:mm')}`;
  return `${format(date, 'd MMM', { locale: es })} a las ${format(date, 'HH:mm')}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function durationLabel(ms: number | null | undefined): string {
  if (!ms || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function isMutedUntil(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

export function formatMutedUntil(iso: string | null | undefined): string {
  if (!isMutedUntil(iso)) return 'Activadas';
  const date = new Date(iso as string);
  if (date.getFullYear() >= 2099) return 'Silenciado siempre';
  if (isToday(date)) return `Silenciado hasta las ${format(date, 'HH:mm')}`;
  return `Silenciado hasta el ${format(date, 'd MMM', { locale: es })}`;
}

export function mutePresetIso(preset: '8h' | '1w' | 'forever' | 'off'): string | null {
  if (preset === 'off') return null;
  if (preset === 'forever') return '2099-12-31T23:59:59.000Z';
  const hours = preset === '8h' ? 8 : 24 * 7;
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}
