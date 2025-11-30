/**
 * Color utilities for theme-aware highlight colors
 * Provides HSL-based color adaptation for light/dark themes
 */

interface HSL {
    h: number; // 0-360
    s: number; // 0-100
    l: number; // 0-100
}

/**
 * Convert hex color to HSL
 */
export function hexToHsl(hex: string): HSL {
    // Remove # if present
    hex = hex.replace(/^#/, '');

    // Parse hex to RGB
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

/**
 * Convert HSL to hex color
 */
export function hslToHex(hsl: HSL): string {
    const h = hsl.h / 360;
    const s = hsl.s / 100;
    const l = hsl.l / 100;

    let r: number, g: number, b: number;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    const toHex = (x: number) => {
        const hex = Math.round(x * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Adapt a color for the opposite theme
 * Light colors become dark, dark colors become light
 * Preserves hue and relative saturation
 */
export function adaptColorForTheme(hex: string, targetTheme: 'light' | 'dark'): string {
    const hsl = hexToHsl(hex);

    // Determine if color is light or dark based on lightness
    const isLightColor = hsl.l > 50;
    const needsAdaptation = (targetTheme === 'dark' && isLightColor) ||
                            (targetTheme === 'light' && !isLightColor);

    if (!needsAdaptation) {
        // Color already suits the target theme, just adjust slightly for visibility
        if (targetTheme === 'dark') {
            // Make dark colors slightly darker for dark theme
            hsl.l = Math.max(15, hsl.l - 10);
        } else {
            // Make light colors slightly lighter for light theme
            hsl.l = Math.min(95, hsl.l + 10);
        }
        return hslToHex(hsl);
    }

    if (targetTheme === 'dark') {
        // Converting light color to dark theme
        // Very light colors (backgrounds): map to dark range
        if (hsl.l >= 85) {
            // Near-white/very light pastels → dark backgrounds
            // Map 85-100 to 15-25 (keeping relative lightness differences)
            hsl.l = 15 + ((100 - hsl.l) / 15) * 10;
        } else if (hsl.l >= 50) {
            // Medium-light colors → medium-dark
            // Map 50-85 to 25-45
            hsl.l = 25 + ((85 - hsl.l) / 35) * 20;
        }

        // Boost saturation slightly for dark backgrounds (colors appear more muted on dark)
        hsl.s = Math.min(100, hsl.s * 1.1);
    } else {
        // Converting dark color to light theme
        if (hsl.l <= 25) {
            // Very dark colors → very light
            // Map 0-25 to 85-98
            hsl.l = 85 + ((25 - hsl.l) / 25) * 13;
        } else if (hsl.l <= 50) {
            // Medium-dark → medium-light
            // Map 25-50 to 70-85
            hsl.l = 70 + ((50 - hsl.l) / 25) * 15;
        }

        // Reduce saturation slightly for light backgrounds
        hsl.s = Math.max(0, hsl.s * 0.9);
    }

    return hslToHex(hsl);
}

/**
 * Adapt text color for readability on the given background
 * Returns a contrasting color that maintains the original hue
 */
export function adaptTextColor(textHex: string, bgHex: string, targetTheme: 'light' | 'dark'): string {
    const textHsl = hexToHsl(textHex);
    const bgHsl = hexToHsl(bgHex);

    // Ensure sufficient contrast
    const minContrast = 40; // Minimum lightness difference

    if (targetTheme === 'dark') {
        // Text should be lighter than background on dark theme
        if (textHsl.l - bgHsl.l < minContrast) {
            textHsl.l = Math.min(95, bgHsl.l + minContrast);
        }
    } else {
        // Text should be darker than background on light theme
        if (bgHsl.l - textHsl.l < minContrast) {
            textHsl.l = Math.max(5, bgHsl.l - minContrast);
        }
    }

    return hslToHex(textHsl);
}

/**
 * Generate a complete color pair for both themes
 * Given a source color and source theme, generates the adapted version
 */
export function generateColorPair(
    sourceColor: string,
    sourceTheme: 'light' | 'dark'
): { light: string; dark: string } {
    const targetTheme = sourceTheme === 'light' ? 'dark' : 'light';
    const adaptedColor = adaptColorForTheme(sourceColor, targetTheme);

    return sourceTheme === 'light'
        ? { light: sourceColor, dark: adaptedColor }
        : { light: adaptedColor, dark: sourceColor };
}

/**
 * Check if a color is considered "chromatic" (has meaningful hue)
 * vs achromatic (gray/white/black)
 */
export function isChromatic(hex: string): boolean {
    const hsl = hexToHsl(hex);
    return hsl.s > 10; // More than 10% saturation = chromatic
}

/**
 * Get the perceived brightness of a color (0-255)
 */
export function getPerceivedBrightness(hex: string): number {
    hex = hex.replace(/^#/, '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    // Using perceived brightness formula
    return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
}
