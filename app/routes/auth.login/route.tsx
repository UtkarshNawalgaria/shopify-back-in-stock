import { type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return login(request);
};
