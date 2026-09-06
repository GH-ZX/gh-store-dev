import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import {
  loadDashboardOperations,
  actDashboardOperations,
} from "@server/dashboard-operations";
export { default } from "@/components/admin/dashboard-operations";
export async function loader(args: LoaderFunctionArgs) {
  return loadDashboardOperations(args);
}
export async function action(args: ActionFunctionArgs) {
  return actDashboardOperations(args);
}
export const meta = () => [{ name: "robots", content: "noindex, nofollow" }];
