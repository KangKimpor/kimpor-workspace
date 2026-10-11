import { HttpError, nudge, serve } from "../_shared/runtime.ts";
import { finishCalendarOAuth } from "../_shared/oauth.ts";
serve(async (request) => {
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.searchParams.getAll("state").length !== 1 ||
    url.searchParams.getAll("code").length !== 1 ||
    url.searchParams.has("error")
  )
    throw new HttpError(
      400,
      "Calendar connection was declined. Return to Kimpor Workspace and try again.",
    );
  const userId = await finishCalendarOAuth(
    url.searchParams.get("state")!,
    url.searchParams.get("code")!,
  );
  await nudge(userId);
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Calendar connected</title><body><main><h1>Calendar connected</h1><p>You can close this window and return to Kimpor Workspace.</p></main></body></html>',
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        "Cache-Control": "no-store",
      },
    },
  );
});
