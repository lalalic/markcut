// Remotion's <Folder> accepts only ASCII letters, digits, '-', and basic CJK.
// This is an internal timeline label, not the authored scene name or review ID.
const VALID_NAME = /^[a-zA-Z0-9\u4E00-\u9FFF-]+$/;
function safePart(value: string, limit: number): string {
  return value.normalize("NFKC")
    .replace(/[^a-zA-Z0-9\u4E00-\u9FFF-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, limit)
    .replace(/-+$/g, "");
}

export function remotionFolderName(name?: string, id?: string): string {
  const authored = (name ?? "").trim();
  if (VALID_NAME.test(authored)) return authored;
  const base = safePart(authored, 80) || "Scene";
  const suffix = safePart(id ?? "", 24);
  return suffix ? `${base}-${suffix}` : base;
}
