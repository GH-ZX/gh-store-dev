import { redirectToDefaultLocale } from "@/lib/routing/default-locale";

export function loader({ request }: { request: Request }) {
  redirectToDefaultLocale(request);
}

export default function Unlocalized() { return null; }
