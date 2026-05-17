export type FileKind =
  | "CorelDRAW"
  | "Photoshop"
  | "图片文件"
  | "PDF"
  | "Illustrator"
  | "压缩包"
  | "其他文件";

export const ACCEPTED_FILE_EXTENSIONS = [
  "cdr",
  "psd",
  "ps",
  "jpg",
  "jpeg",
  "png",
  "pdf",
  "ai",
  "zip",
  "rar"
] as const;

export function getFileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : "";
}

export function classifyFileName(fileName: string): FileKind {
  const extension = getFileExtension(fileName);

  if (extension === "cdr") return "CorelDRAW";
  if (extension === "psd" || extension === "ps") return "Photoshop";
  if (extension === "jpg" || extension === "jpeg" || extension === "png") return "图片文件";
  if (extension === "pdf") return "PDF";
  if (extension === "ai") return "Illustrator";
  if (extension === "zip" || extension === "rar") return "压缩包";

  return "其他文件";
}
