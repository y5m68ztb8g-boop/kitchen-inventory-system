export function getBrakesSearchUrl(productCode: string) {
  return `https://www.brake.co.uk/search?text=${encodeURIComponent(productCode)}`;
}

export async function openExternalUrl(url: string) {
  try {
    const response = await window.fetch("/api/open-external", {
      body: JSON.stringify({ url }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error("External opener rejected the URL.");
    }
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
