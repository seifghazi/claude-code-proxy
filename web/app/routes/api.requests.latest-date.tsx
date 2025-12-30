import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const apiUrl = process.env.API_URL || "http://localhost:3001";

  const response = await fetch(`${apiUrl}/api/requests/latest-date`);

  if (!response.ok) {
    return new Response(JSON.stringify({ latestDate: null }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
