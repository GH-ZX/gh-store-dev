import { redirect } from "react-router";
import { DEFAULT_LOCALE } from "@/lib/app-config";

/** Unprefixed paths land on the default locale in one hop, no middleware. */
export async function loader() {
  throw redirect(`/${DEFAULT_LOCALE}`);
}

export default function RootIndex() {
  return null;
}
