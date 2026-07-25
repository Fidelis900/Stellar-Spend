function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function getLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(foreground: string, background: string): number {
  const fgRgb = hexToRgb(foreground);
  const bgRgb = hexToRgb(background);

  const fgLum = getLuminance(fgRgb);
  const bgLum = getLuminance(bgRgb);

  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);

  return (lighter + 0.05) / (darker + 0.05);
}

export function isWcagAA(contrast: number): boolean {
  return contrast >= 4.5;
}

export function isWcagAAA(contrast: number): boolean {
  return contrast >= 7;
}

export interface ContrastPair {
  foreground: string;
  foregroundName: string;
  background: string;
  backgroundName: string;
  contrast: number;
  wcagAA: boolean;
  wcagAAA: boolean;
}

export function auditContrastPairs(tokens: Record<string, string>): ContrastPair[] {
  const pairs: ContrastPair[] = [];

  const textTokens = ['text', 'text-subtle', 'muted'];
  const bgTokens = ['bg', 'panel', 'panel-elevated', 'panel-overlay', 'line', 'line-strong'];

  for (const textToken of textTokens) {
    for (const bgToken of bgTokens) {
      const fg = tokens[textToken];
      const bg = tokens[bgToken];

      if (fg && bg) {
        const contrast = getContrastRatio(fg, bg);
        pairs.push({
          foreground: fg,
          foregroundName: textToken,
          background: bg,
          backgroundName: bgToken,
          contrast: parseFloat(contrast.toFixed(2)),
          wcagAA: isWcagAA(contrast),
          wcagAAA: isWcagAAA(contrast),
        });
      }
    }
  }

  return pairs;
}
