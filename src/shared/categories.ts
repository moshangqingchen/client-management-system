export const DESIGN_CATEGORIES = [
  "彩页",
  "名片",
  "海报",
  "画册",
  "包装",
  "展架",
  "Logo",
  "其他"
] as const;

export type DesignCategory = (typeof DESIGN_CATEGORIES)[number];
