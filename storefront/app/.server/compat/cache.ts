import { clearCache } from "@server/lib/cache";

/** React Router revalidates loaders after mutations; discard public service snapshots too. */
export function revalidatePath(_path: string, _type?: "layout" | "page") { clearCache(); }
export function revalidateTag(_tag: string) { clearCache(); }
