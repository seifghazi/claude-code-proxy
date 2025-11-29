import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

const PROXY_URL = process.env.PROXY_URL || "http://localhost:3001";

export const loader: LoaderFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);

    // Forward all known filters (model, start/end, pagination) to the Go backend
    const backendUrl = new URL(`${PROXY_URL}/api/requests/summary`);
    url.searchParams.forEach((value, key) => {
      backendUrl.searchParams.append(key, value);
    });

    const response = await fetch(backendUrl.toString());

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error("Failed to fetch request summaries:", error);

    // Return empty array if backend is not available
    return json({ requests: [], total: 0 });
  }
};
