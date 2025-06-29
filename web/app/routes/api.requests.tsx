import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const modelFilter = url.searchParams.get("model");
    const page = url.searchParams.get("page");
    const limit = url.searchParams.get("limit");

    // Forward the request to the Go backend
    const backendUrl = new URL('http://localhost:3001/api/requests');
    if (modelFilter) {
      backendUrl.searchParams.append('model', modelFilter);
    }
    if (page) {
      backendUrl.searchParams.append('page', page);
    }
    if (limit) {
      backendUrl.searchParams.append('limit', limit);
    }

    const response = await fetch(backendUrl.toString());
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error('Failed to fetch requests:', error);
    
    // Return empty array if backend is not available
    return json({ requests: [] });
  }
};

export const action: ActionFunction = async ({ request }) => {
  const method = request.method;
  
  if (method === "DELETE") {
    try {
      // Forward the DELETE request to the Go backend
      const response = await fetch('http://localhost:3001/api/requests', {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return json({ success: true });
    } catch (error) {
      console.error('Failed to clear requests:', error);
      return json({ success: false, error: 'Failed to clear requests' }, { status: 500 });
    }
  }
  
  return json({ error: 'Method not allowed' }, { status: 405 });
};