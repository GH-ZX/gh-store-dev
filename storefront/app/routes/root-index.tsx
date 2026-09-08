import { redirectToDefaultLocale } from "@/lib/routing/default-locale";

/** Unprefixed paths land on the default locale in one hop, no middleware. */
export function loader({ request }: { request: Request }) {
  redirectToDefaultLocale(request);
}

export default function RootIndex() {
  return null;
}
