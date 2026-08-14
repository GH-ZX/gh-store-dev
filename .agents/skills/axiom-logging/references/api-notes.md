# Axiom API — verified notes

Every statement here was checked against the live API with a real token on 2026-08-14, against the `gh-store` dataset. Three of them contradict Axiom's published documentation, and each of those cost a debugging round trip — so prefer this file over the docs, and re-verify rather than trusting either if something stops working.

## Tokens

- Ingest requires an **API token** (`xaat-…`). Personal access tokens are rejected.
- **Ingest and query are separate permissions.** A token with ingest only answers query with:
  ```
  HTTP 403 {"code":403,"message":"token does not have access to resource: query with action: read"}
  ```
  That is a permission problem, not a missing dataset. Grant query/read on the dataset, or issue a second token.
- Header is `Authorization: Bearer <token>` for both ingest and query.

## Ingest

**The path depends on which host you use. This is the documentation's biggest trap.**

| Host | Path |
|------|------|
| API host — `api.axiom.co`, `api.eu.axiom.co` | `POST /v1/datasets/{dataset}/ingest` |
| Edge host — `<region>.aws.edge.axiom.co` | `POST /v1/ingest/{dataset}` |

Axiom's *Send data → Rest API* page documents **only** the second form, written against a placeholder `AXIOM_DOMAIN`. Pairing that path with the API host gives:

```
HTTP 404 {"code":404,"message":"path /v1/ingest/gh-store was not found"}
```

which reads like a missing dataset and is not one. A dataset's edge address is on its own page in the console (`edgeDeploymentUrl`), or from `GET /v2/datasets`.

`src/lib/settings/axiom-settings.ts#axiomIngestUrl` handles both.

### Body — post events FLAT

```jsonc
// correct
[{ "_time": "2026-08-14T06:07:29.138Z", "level": "error", "area": "fulfilment", "event": "refund_failed" }]
```

Axiom stores **the posted object as the row**. Wrapping fields in `data` — which the docs' example appears to endorse — buries them one level down and they become unqueryable by the obvious names:

```jsonc
// WRONG: posting [{ "_time": …, "data": { level, area } }] stores
{"_time":"…","data":{"data":{"level":"info","area":"admin.logging"}}}
// and `| where level == 'error'` then fails with:
//   invalid field: "level"
```

`_time` is the row timestamp and is consumed by Axiom; every other key becomes a field.

Success response:

```json
{"ingested":1,"failed":0,"failures":[],"processedBytes":154,"blocksCreated":0,"walLength":3}
```

`Content-Type: application/json` with a JSON array works. NDJSON (`application/x-ndjson`) also works; the docs show that one.

## Query (APL)

```
POST https://api.axiom.co/v1/datasets/_apl?format=legacy
{ "apl": "['gh-store'] | where level in ('warn','error') | sort by _time desc | limit 50",
  "startTime": "2026-08-07T00:00:00Z",
  "endTime":   "2026-08-15T00:00:00Z" }
```

- **`?format=legacy` is required.** Omitting it gives `HTTP 422 {"code":602,"message":"format in query is required"}`.
- `startTime` / `endTime` are optional; omitting them queries the default window.
- Queries go to the **API host**. An edge host does not serve `_apl`.
- The dataset name is quoted inside brackets: `['gh-store']`.

### Response shape

```jsonc
{
  "format": "legacy",
  "status": { "rowsExamined": 4, "rowsMatched": 4, "isPartial": false, … },
  "matches": [
    { "_time": "…", "_sysTime": "…", "_rowId": "…", "data": { /* the event's fields */ } }
  ],
  "buckets": …, "datasetNames": …, "fieldsMetaMap": …
}
```

**Every row carries every column the dataset has ever seen**, nulled where that event did not set it — so a three-field event returns with thirty keys. Filter nulls before displaying, or the useful fields drown.

Note this also means the schema is sticky: fields written by an earlier, wrong shape (`data.*`) linger as null columns on every later row.

## MCP server

`https://mcp.axiom.co/mcp` — hosted, OAuth in the browser, so an agent never sees the token. Exposes `queryApl`, `listDatasets`, `getDatasetSchema`, plus dashboard and monitor tools.

Add it to Claude Code with:

```
claude mcp add --transport http --scope user axiom https://mcp.axiom.co/mcp
```

User scope, not a repo `.mcp.json`: a project-scoped file is only read when its own
directory is the session root, and this repo is usually opened from its parent — so
the file sits there looking configured while `/mcp` reports nothing. Authenticate
afterwards with `/mcp`; it is browser OAuth, so the agent never sees a token.

Worth having: querying this store's logs directly is much faster than writing a curl probe, which is how every fact in this file was established. Revoke under **Settings → Profile → Sessions**.

The hosted server is in the US; queries route through US infrastructure regardless of workspace region.
