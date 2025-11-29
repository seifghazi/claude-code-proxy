import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:3001";

export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params;

  if (!id) {
    throw new Response("Request ID is required", { status: 400 });
  }

  const proxyUrl = `${PROXY_URL}/api/requests/${id}`;
  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Response(`Failed to fetch request: ${response.statusText}`, {
      status: response.status,
    });
  }

  return json(await response.json());
}
