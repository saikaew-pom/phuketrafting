export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = ["en", "th", "zh", "ru"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
