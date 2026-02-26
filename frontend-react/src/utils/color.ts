export type ColorFormat = "hex" | "rgb" | "hsl" | "hsv";

export const appendAlpha = ({ rgbHex, alpha: _alpha = 1 }: { rgbHex: string; alpha?: number }) => rgbHex;
export const extractColorFromText = ({ text }: { text: string }) => text;
export const formatColorValue = ({ hex, format: _format }: { hex: string; format: ColorFormat }) => hex;
export const hexToHsv = ({ hex: _hex }: { hex: string }) => [0, 0, 0];
export const hsvToHex = ({ h: _h, s: _s, v: _v }: { h: number; s: number; v: number }) => "FFFFFF";
export const parseColorInput = ({ input, format: _format }: { input: string; format: ColorFormat }) => input;
export const parseHexAlpha = ({ hex }: { hex: string }) => ({ rgb: hex, alpha: 1 });
