# IGDB API — GH-Store reference

**Official docs:** [https://api-docs.igdb.com/#getting-started](https://api-docs.igdb.com/#getting-started)

This store uses IGDB (Twitch) for **game covers, artworks, screenshots, and logos** in the admin products UI. Credentials are stored in **Supabase `store_settings`** (not Vite env) and called via the **`igdb` Edge Function** (browser cannot call IGDB directly — CORS).

---

## 1. Account setup (admin)

1. Create a free [Twitch](https://dev.twitch.tv/login) account.
2. Enable **Two-Factor Authentication** on Twitch.
3. Open [Twitch Developer Console → Applications → Register](https://dev.twitch.tv/console/apps/create).
4. Set:
   - **Name:** e.g. `GH-Store`
   - **OAuth Redirect URL:** `http://localhost` (required field; not used by IGDB)
   - **Client Type:** **Confidential** (needed for Client Secret)
5. Open the app → **New Secret** → copy **Client ID** and **Client Secret**.
6. In the store admin: **Products → Game images — IGDB** → paste Client ID + Client Secret → Save.
7. Optional: enable **Auto cover on G2Bulk sync** so new/synced games (without a custom cover) get an IGDB cover using the **first word** of the English name only.

Free non-commercial use under the [Twitch Developer Service Agreement](https://www.twitch.tv/p/legal/developer-agreement/). Commercial use: contact partner@igdb.com.

---

## 2. Authentication

`POST https://id.twitch.tv/oauth2/token`
Query params:

| Param | Value |
|--------|--------|
| `client_id` | Twitch Client ID |
| `client_secret` | Twitch Client Secret |
| `grant_type` | `client_credentials` |

Response:

```json
{
  "access_token": "…",
  "expires_in": 5587808,
  "token_type": "bearer"
}
```

Refresh before `expires_in` seconds (edge function caches the token in memory).

---

## 3. API requests

| Item | Value |
|------|--------|
| Base URL | `https://api.igdb.com/v4` |
| Method | Almost always **POST** |
| Headers | `Client-ID: {client_id}` · `Authorization: Bearer {access_token}` · `Accept: application/json` |
| Body | Apicalypse query string (not JSON) |

Example body:

```
search "Valorant";
fields name,slug,cover.image_id,artworks.image_id,screenshots.image_id;
where version_parent = null;
limit 10;
```

**Rate limit:** 4 requests/second (HTTP 429 if exceeded). Max ~8 concurrent open requests.

---

## 4. Images

IGDB returns `image_id` strings. Build CDN URLs:

```
https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg
```

Useful sizes for this store:

| Size | Use |
|------|-----|
| `t_thumb` | Search grid thumbs |
| `t_cover_big` | Covers / catalog cards |
| `t_1080p` | High-res cover / hero |
| `t_screenshot_med` | Screenshots preview |
| `t_screenshot_huge` | Full screenshots |

**Endpoints we use**

| Endpoint | Purpose |
|----------|---------|
| `/games` | Search by name; expand cover / artworks / screenshots |
| `/covers` | Extra covers if needed |
| `/artworks` | Official art |
| `/screenshots` | In-game shots |

Game “logos” are rare on IGDB; we treat **square artworks** and **covers** as logo candidates for the carousel logo field.

---

## 5. GH-Store integration map

| Piece | Path |
|--------|------|
| Docs (this file) | `docs/providers/igdb-api.md` |
| Credentials | `store_settings.providers.igdb` (`client_id`, `client_secret`) — server-only, masked hints for UI |
| Settings module | `src/lib/settings/igdb-settings.ts` |
| API client | `src/providers/igdb/client.ts` (token cached in module scope, server-only) |
| Admin service | `getIgdbStatus` / `saveIgdbSettings` in `src/lib/services/admin-settings.service.ts` |
| Save + verify actions | `src/app/[locale]/dashboard/providers/actions.ts` |
| Settings UI | Providers page → Operations group → "IGDB artwork" |
| Artwork search UI | `src/components/admin/igdb-artwork-picker.tsx`, embedded in the game editor |

The reference store proxied IGDB through an edge function because its SPA could
not escape CORS; this stack's server actions are the same idea with less moving
parts.

### Actions

| Action | Who | What |
|--------|-----|------|
| `saveIgdbSettingsAction` | admin | Save client ID / secret (blank secret = keep existing) |
| `verifyIgdbAction` | admin | Token + a real sample search |
| `searchIgdbArtworkAction` | admin | `{ query }` → covers + artwork for the picker |

---

## 6. CORS

IGDB does **not** allow browser origins. Never call `api.igdb.com` from the Vite SPA. Always go through `supabase.functions.invoke('igdb', …)`.

---

## 7. Ops checklist

1. Run SQL: `scripts/igdb-settings-migration.sql`
2. Deploy: `supabase functions deploy igdb`
3. Paste Twitch Client ID + Secret on Products → IGDB
4. Open a game → Advanced image search → pick cover/logo

Removed: **RAWG** (`VITE_RAWG_API_KEY`) and env-based SteamGrid as the primary source.
