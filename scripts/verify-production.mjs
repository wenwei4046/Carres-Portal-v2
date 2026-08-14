const expected = process.env.EXPECTED_SHA;
if (!expected) throw new Error("EXPECTED_SHA is required");

const targets = [
  ["carres-portal Pages", "https://carres-portal.pages.dev/__carres_deploy.json"],
  ["carres-pos Pages", "https://carres-pos.pages.dev/__carres_deploy.json"],
  ["ERP canonical", "https://erp.carresofficial.com/__carres_deploy.json"],
  ["POS canonical", "https://pos.carresofficial.com/__carres_deploy.json"],
  ["API Worker", "https://api.carresofficial.com/health"],
];
const deadline = Date.now() + Number(process.env.CONVERGENCE_TIMEOUT_MS ?? 900_000);
let last = [];

while (Date.now() < deadline) {
  last = await Promise.all(targets.map(async ([name, url]) => {
    try {
      const response = await fetch(`${url}?proof=${expected}`, { headers: { "cache-control": "no-cache" } });
      const body = await response.json();
      return { name, url, status: response.status, actual: body.commit, ok: response.ok && body.commit === expected };
    } catch (error) {
      return { name, url, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  if (last.every((result) => result.ok)) {
    console.log(`Production converged to ${expected}:`);
    for (const result of last) console.log(`- ${result.name}: ${result.url}`);
    process.exit(0);
  }
  console.log(`Waiting for ${expected}; ${last.map((r) => `${r.name}=${r.actual ?? r.error ?? r.status}`).join(", ")}`);
  await new Promise((resolveWait) => setTimeout(resolveWait, 15_000));
}
console.error(JSON.stringify({ expected, results: last }, null, 2));
throw new Error("Production surfaces did not converge before the timeout");
