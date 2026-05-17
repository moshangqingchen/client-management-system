import assert from "node:assert/strict";

const validExtensions = new Set([
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
]);

function classifyFileName(fileName) {
  const extension = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
  if (["jpg", "jpeg", "png"].includes(extension)) return "图片文件";
  if (["psd", "ps"].includes(extension)) return "Photoshop";
  if (extension === "cdr") return "CorelDRAW";
  if (extension === "ai") return "Illustrator";
  if (extension === "pdf") return "PDF";
  if (["zip", "rar"].includes(extension)) return "压缩包";
  return "其他文件";
}

for (const ext of validExtensions) {
  assert.notEqual(classifyFileName(`sample.${ext}`), "其他文件");
}

assert.equal(classifyFileName("brief.docx"), "其他文件");

console.log("Smoke checks passed");
