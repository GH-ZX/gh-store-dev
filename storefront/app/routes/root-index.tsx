import { redirect } from "react-router";
import { DEFAULT_LOCALE } from "@/lib/app-config";

/** Unprefixed paths land on the default locale in one hop, no middleware. */
export async function loader({ request }: { request: Request }) {
  throw redirect(`/${DEFAULT_LOCALE}${new URL(request.url).search}`);
}

export default function RootIndex() {
  return null;
}
