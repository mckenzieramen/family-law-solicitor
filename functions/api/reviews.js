export async function onRequestGet({env}) {
  const reply = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
  if (!env.GOOGLE_PLACES_API_KEY || !env.GOOGLE_PLACE_ID) return reply({available:false}, 503);
  try {
    const response = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(env.GOOGLE_PLACE_ID), {
      headers: {
        'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'rating,userRatingCount,reviews.rating,reviews.text,reviews.authorAttribution,reviews.relativePublishTimeDescription'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) return reply({available:false}, 502);
    return reply(await response.json());
  } catch {
    return reply({available:false}, 502);
  }
}
