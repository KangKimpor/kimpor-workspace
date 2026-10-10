import {
  assertCapacity,
  database,
  encoded,
  HttpError,
  json,
  nudge,
  owner,
  readBody,
  serve,
  env,
} from "../_shared/runtime.ts";
import {
  beginCalendarOAuth,
  accessToken,
  type ConnectedAccount,
} from "../_shared/oauth.ts";
import { seal, unseal } from "../_shared/credentials.ts";
import { googleAction, outlookAction } from "../_shared/calendar-api.ts";
import {
  caldavAction,
  discoverCalDav,
  type CaldavCredentials,
} from "../_shared/caldav.ts";
import { fetchPublic, safeRemoteUrl } from "../_shared/network.ts";
import { importIcs } from "../../../packages/integrations/src/ics.ts";
import { revokeCalendarAccount } from "../_shared/calendar-service.ts";
serve(async (request) => {
  if (request.method !== "POST") throw new HttpError(405, "Use POST");
  const userId = await owner(request);
  const body = await readBody(request);
  const action = String(body.action || "");
  if (action === "accounts") {
    const accounts = (await database(
      `connected_accounts?user_id=eq.${encoded(userId)}&select=id,provider,label,status,last_sync_at`,
    )) as Record<string, unknown>[];
    return json({
      accounts: accounts.map((account) => ({
        id: account.id,
        provider: account.provider,
        label: account.label,
        status: account.status,
        lastSyncAt: account.last_sync_at,
      })),
    });
  }
  if (action === "connect") {
    await assertCapacity(4096);
    const provider = String(body.provider);
    if (provider === "google" || provider === "outlook")
      return json({ url: await beginCalendarOAuth(userId, provider) });
    let credentials: unknown;
    if (provider === "caldav") {
      if (!body.username || !body.password)
        throw new HttpError(400, "Enter username and an app-specific password");
      credentials = await discoverCalDav({
        url: safeRemoteUrl(String(body.url)).href,
        username: String(body.username),
        password: String(body.password),
      });
    } else if (provider === "ics") {
      const url = safeRemoteUrl(
        String(body.url),
        env("CALENDAR_ALLOWED_HOSTS")
          .split(",")
          .map((value) => value.trim()),
      ).href;
      const response = await fetchPublic(url);
      if (!response.ok)
        throw new HttpError(502, "Subscription could not be downloaded");
      importIcs(await response.text(), "UTC");
      credentials = { url };
    } else throw new HttpError(400, "Unknown calendar provider");
    const accounts = (await database("connected_accounts", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        provider,
        label: String(
          body.label ||
            `${provider === "ics" ? "Calendar subscription" : "CalDAV account"}`,
        ),
        encrypted_credentials: await seal(credentials, userId),
      }),
    })) as { id: string }[];
    await nudge(userId);
    return json({ accountId: accounts[0]?.id });
  }
  const accounts = (await database(
    `connected_accounts?id=eq.${encoded(String(body.accountId))}&user_id=eq.${encoded(userId)}`,
  )) as ConnectedAccount[];
  const account = accounts[0];
  if (!account) throw new HttpError(404, "Calendar account was not found");
  if (body.provider && body.provider !== account.provider)
    throw new HttpError(400, "Calendar provider does not match account");
  if (action === "disconnect") {
    const revoked = await revokeCalendarAccount(account);
    await database(
      `connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(userId)}`,
      { method: "DELETE" },
    );
    await nudge(userId);
    return json({ ok: true, providerRevoked: revoked });
  }
  if (action === "listEvents") {
    const range = body.range as { start?: string; end?: string } | undefined;
    const start = Date.parse(range?.start || ""),
      end = Date.parse(range?.end || "");
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 370 * 86400000
    )
      throw new HttpError(400, "Use an event range of at most 370 days");
  }
  let result: Record<string, unknown>;
  if (account.provider === "google")
    result = await googleAction(await accessToken(account), body);
  else if (account.provider === "outlook")
    result = await outlookAction(await accessToken(account), body);
  else if (account.provider === "caldav")
    result = await caldavAction(
      await unseal<CaldavCredentials>(account.encrypted_credentials, userId),
      body,
    );
  else {
    if (action === "listCalendars")
      result = {
        calendars: [
          {
            id: account.id,
            title: account.label,
            color: "#2268bf",
            readOnly: true,
          },
        ],
      };
    else if (action === "listEvents") {
      const { url } = await unseal<{ url: string }>(
        account.encrypted_credentials,
        userId,
      );
      const response = await fetchPublic(url);
      if (!response.ok)
        throw new HttpError(
          502,
          "Calendar subscription is temporarily unavailable",
        );
      result = {
        events: importIcs(await response.text(), "UTC"),
        fullResync: true,
      };
    } else throw new HttpError(403, "Calendar subscriptions are read-only");
  }
  await database(
    `connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        last_sync_at: new Date().toISOString(),
        status: "connected",
      }),
    },
  );
  return json(result);
});
