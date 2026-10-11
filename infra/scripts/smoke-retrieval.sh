#!/usr/bin/env bash
# Smoke test of the knowledge path, end to end, on the real stack:
#
#   PostgreSQL -> normalization (ingest the OSV fixtures) -> retrieval (POST /internal/retrieve)
#   -> the deterministic result Retrieval publishes to Reports
#
# Reports is replaced by a stand-in that records what it receives (its endpoints are not built
# yet), see infra/scripts/smoke/. It checks the exact result written in fixtures/README.md:
# one finding for Acme.Serialization (SAMPLE-0001), the license finding of Acme.GplToolkit,
# nothing for SAMPLE-0002 / SAMPLE-0003, and the same answer when asked twice.
#
#   bash infra/scripts/smoke-retrieval.sh
#   KEEP_STACK=1 bash infra/scripts/smoke-retrieval.sh     leave the containers running
#
# Needs Docker and Node. It creates .env (with generated local secrets) if there is none.
set -euo pipefail

cd "$(dirname "$0")/../.."

NORMALIZATION="http://localhost:${NORMALIZATION_PORT:-4200}"
RETRIEVAL="http://localhost:${RETRIEVAL_PORT:-4300}"
REPORTS_STUB="http://localhost:${SMOKE_REPORTS_PORT:-4590}"

[ -f .env ] || node infra/scripts/bootstrap-env.mjs
TOKEN="$(grep '^INTERNAL_SERVICE_TOKEN=' .env | cut -d= -f2-)"

# --env-file: the compose file lives in infra/compose, so without it the variables of the root
# .env would not reach the ${...} defaults of the compose file.
COMPOSE=(docker compose --env-file .env -f infra/compose/compose.yaml -f infra/scripts/smoke/compose.smoke.yaml)

step() { printf '\n== %s\n' "$1"; }
fail() { printf '\nSMOKE TEST FAILED: %s\n' "$1" >&2; exit 1; }

cleanup() {
  if [ "${KEEP_STACK:-0}" != "1" ]; then "${COMPOSE[@]}" down >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

wait_for() { # url, label
  for _ in $(seq 1 60); do
    if curl -sf "$1" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail "$2 did not become ready ($1)"
}

step "Starting postgres, registry, normalization, retrieval and the Reports stand-in"
"${COMPOSE[@]}" up -d --build postgres registry normalization retrieval reports-stub >/dev/null
wait_for "$NORMALIZATION/readyz" "normalization (readyz: the database must answer)"
wait_for "$RETRIEVAL/healthz" "retrieval"
wait_for "$REPORTS_STUB/healthz" "the Reports stand-in"

step "Ingesting the OSV fixtures (twice: the second run must change nothing)"
auth=(-H "x-internal-token: $TOKEN")
first="$(curl -sf -X POST "${auth[@]}" "$NORMALIZATION/internal/ingest/osv")"
second="$(curl -sf -X POST "${auth[@]}" "$NORMALIZATION/internal/ingest/osv")"
echo "first : $first"
echo "second: $second"
node -e '
  const [first, second] = process.argv.slice(1).map((text) => JSON.parse(text));
  // A fresh database takes the 3 fixture advisories; a database that already has them takes none.
  if (![0, 3].includes(first.recordsProcessed)) process.exit(1);
  if (second.recordsProcessed !== 0) process.exit(1);
' "$first" "$second" || fail "unexpected ingestion counts"

step "Asking normalization for the sample packages"
candidates="$(curl -sf -X POST "${auth[@]}" -H 'content-type: application/json' \
  "$NORMALIZATION/internal/knowledge/query" \
  -d '{"packages":[{"ecosystem":"nuget","name":"Acme.Serialization","version":"1.4.0"}]}')"
node -e '
  const ids = JSON.parse(process.argv[1]).objects.map((object) => object.id);
  console.log("candidates:", ids.join(", "));
  // Candidates are by package, not by version: SAMPLE-0003 is one, SAMPLE-0002 (other package) not.
  if (JSON.stringify(ids) !== JSON.stringify(["osv:SAMPLE-0001", "osv:SAMPLE-0003"])) process.exit(1);
' "$candidates" || fail "normalization returned the wrong candidates"

request_for() { # analysis id
  "${COMPOSE[@]}" exec -T retrieval pnpm --filter @gyde/retrieval exec \
    tsx ../../infra/scripts/smoke/make-request.ts "$1" | tail -n 1
}

retrieve() { # analysis id
  local body code
  body="$(request_for "$1")"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${auth[@]}" \
    -H 'content-type: application/json' "$RETRIEVAL/internal/retrieve" -d "$body")"
  [ "$code" = "202" ] || fail "POST /internal/retrieve answered $code, expected 202"
}

published() { # analysis id -> the deterministic result Retrieval published, or empty
  for _ in $(seq 1 30); do
    local found
    found="$(curl -sf "$REPORTS_STUB/captured" | node -e '
      let text = "";
      process.stdin.on("data", (chunk) => (text += chunk)).on("end", () => {
        const url = `/internal/analyses/${process.argv[1]}/deterministic`;
        const hit = JSON.parse(text).find((call) => call.url === url);
        if (hit) console.log(JSON.stringify(hit));
      });
    ' "$1")"
    if [ -n "$found" ]; then printf '%s' "$found"; return 0; fi
    sleep 1
  done
  return 1
}

step "POST /internal/retrieve with the sample request (twice)"
retrieve smoke-1
retrieve smoke-2
one="$(published smoke-1)" || fail "Retrieval never published the result of smoke-1 to Reports"
two="$(published smoke-2)" || fail "Retrieval never published the result of smoke-2 to Reports"

step "Checking the exact result of fixtures/README.md"
node -e '
  const [one, two] = process.argv.slice(1).map((text) => JSON.parse(text));
  const result = one.body;
  const titles = result.findings.map((finding) => finding.title);
  console.log(titles.map((title) => "  - " + title).join("\n"));

  const expected = [
    "Acme.Serialization 1.4.0 is affected by SAMPLE-0001",
    "Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution",
  ];
  const problems = [];
  if (JSON.stringify(titles) !== JSON.stringify(expected)) problems.push("findings differ from the expected ones, or their order");
  if (/SAMPLE-0002|SAMPLE-0003/.test(JSON.stringify(result))) problems.push("a finding mentions SAMPLE-0002 or SAMPLE-0003");
  const vulnerability = result.findings[0];
  if (vulnerability?.severity !== "high" || vulnerability?.cvss !== 7.5) problems.push("SAMPLE-0001 is not high / CVSS 7.5");
  if (result.partialSources !== false) problems.push("partialSources is not false");
  if (!one.hasInternalToken) problems.push("Retrieval did not send the internal token to Reports");
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const strip = (body) => ({ ...body, analysisId: "same" });
  if (!same(strip(one.body), strip(two.body))) problems.push("the second run did not give the same result");

  if (problems.length > 0) { console.error(problems.join("\n")); process.exit(1); }
' "$one" "$two" || fail "the published result is not the expected one"

printf '\nSMOKE TEST PASSED\n'
