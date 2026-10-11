#!/usr/bin/env bash
# Smoke test of the analysis path, end to end, on the real stack (no stand-ins):
#
#   PostgreSQL -> normalization (ingest the OSV fixtures)
#   Reports (POST /internal/analyses) -> retrieval -> [llm-analysis] -> Reports (GET .../:id = ready)
#
# Three cases, each checked against the exact result of fixtures/README.md (one finding for
# Acme.Serialization by SAMPLE-0001, the license finding of Acme.GplToolkit, nothing for
# SAMPLE-0002 / SAMPLE-0003, always in that order):
#   1. Free plan, no AI            -> ready, NOT degraded
#   2. Pro plan, AI, mock enabled  -> ready, NOT degraded, every finding has an aiExplanation
#   3. Pro plan, AI, llm-analysis stopped -> ready, degraded with llm-unavailable
#
#   bash infra/scripts/smoke-retrieval.sh
#   KEEP_STACK=1 bash infra/scripts/smoke-retrieval.sh     leave the containers running
#
# Needs Docker and Node. It creates .env (with generated local secrets) if there is none, and
# needs LLM_MOCK_ENABLED=true in it (the default of .env.example). llm-analysis asks `web` for the
# tenant's LLM settings, so `web` is started too.
set -euo pipefail

cd "$(dirname "$0")/../.."

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gyde-smoke}"
NORMALIZATION="http://localhost:${NORMALIZATION_PORT:-4200}"
RETRIEVAL="http://localhost:${RETRIEVAL_PORT:-4300}"
REPORTS="http://localhost:${REPORTS_PORT:-4500}"
LLM_ANALYSIS="http://localhost:${LLM_ANALYSIS_PORT:-4400}"
WEB="http://localhost:${WEB_PORT:-3000}"

[ -f .env ] || node infra/scripts/bootstrap-env.mjs
TOKEN="$(grep '^INTERNAL_SERVICE_TOKEN=' .env | cut -d= -f2-)"

step() { printf '\n== %s\n' "$1"; }
fail() { printf '\nSMOKE TEST FAILED: %s\n' "$1" >&2; exit 1; }

grep -q '^LLM_MOCK_ENABLED=true' .env || fail "set LLM_MOCK_ENABLED=true in .env (the AI case runs on the mock)"

# --env-file: the compose file lives in infra/compose, so without it the variables of the root
# .env would not reach the ${...} defaults of the compose file.
COMPOSE=(docker compose --env-file .env -f infra/compose/compose.yaml)

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

auth=(-H "x-internal-token: $TOKEN")
json=(-H 'content-type: application/json')

step "Starting postgres, registry, normalization, retrieval, reports, llm-analysis and web"
"${COMPOSE[@]}" up -d --build postgres registry normalization retrieval reports llm-analysis web >/dev/null
wait_for "$NORMALIZATION/readyz" "normalization (readyz: the database must answer)"
wait_for "$RETRIEVAL/healthz" "retrieval"
wait_for "$REPORTS/healthz" "reports"
wait_for "$LLM_ANALYSIS/healthz" "llm-analysis"
wait_for "$WEB/healthz" "web"

step "Ingesting the OSV fixtures (twice: the second run must change nothing)"
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
candidates="$(curl -sf -X POST "${auth[@]}" "${json[@]}" "$NORMALIZATION/internal/knowledge/query" \
  -d '{"packages":[{"ecosystem":"nuget","name":"Acme.Serialization","version":"1.4.0"}]}')"
node -e '
  const ids = JSON.parse(process.argv[1]).objects.map((object) => object.id);
  console.log("candidates:", ids.join(", "));
  // Candidates are by package, not by version: SAMPLE-0003 is one, SAMPLE-0002 (other package) not.
  if (JSON.stringify(ids) !== JSON.stringify(["osv:SAMPLE-0001", "osv:SAMPLE-0003"])) process.exit(1);
' "$candidates" || fail "normalization returned the wrong candidates"

# The body of POST /internal/analyses for the shared sample project (the one the fixtures are
# written for), built from @gyde/contracts inside the dev image.
job_for() { # plan, ai|noai
  "${COMPOSE[@]}" exec -T retrieval pnpm --filter @gyde/retrieval exec \
    tsx ../../infra/scripts/smoke/make-job.ts "$1" "$2" | tail -n 1
}

# Creates an analysis in Reports and waits until it is ready; prints the report as JSON.
run_analysis() { # plan, ai|noai
  local created id report
  created="$(curl -sf -X POST "${auth[@]}" "${json[@]}" "$REPORTS/internal/analyses" -d "$(job_for "$1" "$2")")" \
    || fail "POST /internal/analyses was refused ($1, $2)"
  id="$(node -e 'console.log(JSON.parse(process.argv[1]).analysisId)' "$created")"
  for _ in $(seq 1 90); do
    report="$(curl -sf "${auth[@]}" "$REPORTS/internal/analyses/$id")"
    if [ "$(node -e 'console.log(JSON.parse(process.argv[1]).status)' "$report")" = "ready" ]; then
      printf '%s' "$report"
      return 0
    fi
    sleep 1
  done
  fail "the analysis $id never reached ready ($1, $2)"
}

# Checks one report. expectations: <degraded true|false> <degradedReason|none> <ai yes|no>
check_report() { # label, report, degraded, reason, ai
  node -e '
    const [label, text, degraded, reason, ai] = process.argv.slice(1);
    const report = JSON.parse(text);
    const titles = report.findings.map((finding) => finding.title);
    console.log(`${label}: status=${report.status} degraded=${report.degraded} reason=${report.degradedReason ?? "-"}`);
    console.log(titles.map((title) => "  - " + title).join("\n"));
    console.log("  layers:", report.appliedLayers.join(", "));

    const expected = [
      "Acme.Serialization 1.4.0 is affected by SAMPLE-0001",
      "Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution",
    ];
    const problems = [];
    if (report.status !== "ready") problems.push("not ready");
    if (JSON.stringify(titles) !== JSON.stringify(expected)) problems.push("findings differ from the expected ones, or their order");
    if (/SAMPLE-0002|SAMPLE-0003/.test(JSON.stringify(report.findings))) problems.push("a finding mentions SAMPLE-0002 or SAMPLE-0003");
    const vulnerability = report.findings[0];
    if (vulnerability?.severity !== "high" || vulnerability?.cvss !== 7.5) problems.push("SAMPLE-0001 is not high / CVSS 7.5");
    if (String(report.degraded) !== degraded) problems.push(`degraded is ${report.degraded}, expected ${degraded}`);
    if (reason !== "none" && report.degradedReason !== reason) problems.push(`degradedReason is ${report.degradedReason}, expected ${reason}`);
    if (reason === "none" && report.degradedReason) problems.push(`unexpected degradedReason ${report.degradedReason}`);
    const explained = report.findings.every((finding) => typeof finding.aiExplanation === "string" && finding.aiExplanation.length > 0);
    const anyExplained = report.findings.some((finding) => finding.aiExplanation);
    if (ai === "yes" && !explained) problems.push("a finding has no aiExplanation");
    if (ai === "yes" && !report.appliedLayers.includes("ai-enrichment")) problems.push("the ai-enrichment layer was not applied");
    if (ai === "no" && anyExplained) problems.push("a finding has an aiExplanation although the AI did not run");
    if (!report.appliedLayers.includes("license-compliance")) problems.push("the license-compliance layer was not applied");
    if (problems.length > 0) { console.error(problems.join("\n")); process.exit(1); }
  ' "$@"
}

step "Case 1: Free plan, no AI (ready, not degraded)"
free_one="$(run_analysis free noai)"
check_report "free" "$free_one" false none no || fail "case 1"

step "Case 1 again: the same request must give the same findings in the same order"
free_two="$(run_analysis free noai)"
node -e '
  const findings = (text) => JSON.stringify(JSON.parse(text).findings);
  if (findings(process.argv[1]) !== findings(process.argv[2])) process.exit(1);
' "$free_one" "$free_two" || fail "the second run did not give the same findings"
echo "identical findings"

step "Case 2: Pro plan, AI requested, llm-analysis on the mock (ready, not degraded, explained)"
check_report "pro+ai" "$(run_analysis pro ai)" false none yes || fail "case 2"

step "Case 3: Pro plan, AI requested, llm-analysis stopped (ready, degraded: llm-unavailable)"
"${COMPOSE[@]}" stop llm-analysis >/dev/null
check_report "pro+ai, llm down" "$(run_analysis pro ai)" true llm-unavailable no || fail "case 3"

printf '\nSMOKE TEST PASSED\n'
