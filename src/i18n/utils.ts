import { ui } from './translations.ts';
import type { Lang } from './translations.ts';

export type { Lang };

export function getLangFromUrl(url: URL): Lang {
  const [, first] = url.pathname.split('/');
  return first === 'de' ? 'de' : 'en';
}

export function useTranslations(lang: Lang) {
  return (key: string): string => ui[lang]?.[key] ?? ui.en[key] ?? key;
}
