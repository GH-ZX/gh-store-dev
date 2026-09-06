import { redirect as routerRedirect } from "react-router";

export function redirect(url: string): never { throw routerRedirect(url); }
export function notFound(): never { throw new Response("Not Found", { status: 404 }); }
