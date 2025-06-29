import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const modelFilter = url.searchParams.get("model");

    const backendUrl = new URL('http://localhost:3001/api/conversations');
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
    console.error('Failed to fetch conversations:', error);
    return json({ conversations: [] });
  }
}; 