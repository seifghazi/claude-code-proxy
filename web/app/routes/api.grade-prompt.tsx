import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  
  try {
    const body = await request.json();
    
    // Forward the request to the Go backend
    const response = await fetch('http://localhost:3001/api/grade-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error('Failed to grade prompt:', error);
    return json({ 
      error: 'Failed to grade prompt. Please ensure the backend is running and has a valid Anthropic API key.' 
    }, { status: 500 });
  }
};