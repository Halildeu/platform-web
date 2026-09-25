export type ParsedColor = Readonly<{ rgb: readonly [number, number, number]; alpha: number }>;

export declare const RATIO_TOLERANCE: number;
export declare function parseCssColor(raw: string): ParsedColor;
export declare function compositeOver(top: ParsedColor, bottom: ParsedColor): ParsedColor;
export declare function relativeLuminance(color: ParsedColor): number;
export declare function contrastRatio(foreground: ParsedColor, background: ParsedColor): number;
