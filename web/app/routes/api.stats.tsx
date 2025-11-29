import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:3001";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);

  const proxyUrl = `${PROXY_URL}/api/stats${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }

  return json(await response.json());
}
