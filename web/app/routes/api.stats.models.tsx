import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:3001";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");

  if (!date) {
    throw new Response("date is required", { status: 400 });
  }

  const params = new URLSearchParams({ date });
  const proxyUrl = `${PROXY_URL}/api/stats/models?${params.toString()}`;
  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch model stats: ${response.statusText}`);
  }

  return json(await response.json());
}
