export interface MultiAppAppearance {
  backgroundColor: string;
  title: string;
  logoUri: string;
  showTitle: boolean;
  showLogo: boolean;
}

export const DEFAULT_MULTI_APP_APPEARANCE: MultiAppAppearance = {
  backgroundColor: '#2b7fff',
  title: 'FreeKiosk',
  logoUri: '',
  showTitle: true,
  showLogo: true,
};

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/** Validate persisted/imported values before passing them to native views. */
export function normalizeMultiAppAppearance(
  value: unknown,
): MultiAppAppearance {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    backgroundColor:
      typeof data.backgroundColor === 'string' &&
      isHexColor(data.backgroundColor)
        ? data.backgroundColor.trim()
        : DEFAULT_MULTI_APP_APPEARANCE.backgroundColor,
    title:
      typeof data.title === 'string'
        ? data.title.slice(0, 100)
        : DEFAULT_MULTI_APP_APPEARANCE.title,
    logoUri:
      typeof data.logoUri === 'string' && data.logoUri.startsWith('file://')
        ? data.logoUri
        : '',
    showTitle: typeof data.showTitle === 'boolean' ? data.showTitle : true,
    showLogo: typeof data.showLogo === 'boolean' ? data.showLogo : true,
  };
}

export function parseMultiAppAppearance(
  value: string | null | undefined,
): MultiAppAppearance {
  try {
    return normalizeMultiAppAppearance(value ? JSON.parse(value) : null);
  } catch {
    return { ...DEFAULT_MULTI_APP_APPEARANCE };
  }
}

/** Choose the higher-contrast black/white foreground using relative luminance. */
export function getMultiAppForeground(backgroundColor: string): string {
  const color = isHexColor(backgroundColor)
    ? backgroundColor.trim()
    : DEFAULT_MULTI_APP_APPEARANCE.backgroundColor;
  const channels = [1, 3, 5].map(start => {
    const channel = parseInt(color.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05)
    ? '#000000'
    : '#ffffff';
}
