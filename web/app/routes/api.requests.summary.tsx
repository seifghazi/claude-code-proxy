import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const modelFilter = url.searchParams.get("model");

    // Forward the request to the Go backend summary endpoint
    const backendUrl = new URL('http://localhost:3001/api/requests/summary');
    if (modelFilter) {
      backendUrl.searchParams.append('model', modelFilter);
    }

    const response = await fetch(backendUrl.toString());

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error('Failed to fetch request summaries:', error);

    // Return empty array if backend is not available
    return json({ requests: [], total: 0 });
  }
};
