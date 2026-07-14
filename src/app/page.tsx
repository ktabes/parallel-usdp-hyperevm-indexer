const phaseZeroChecks = [
  "Strict runtime configuration",
  "Versioned PostgreSQL migrations",
  "Deterministic test lanes",
  "Metric and evidence contracts",
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Parallel V3 · HyperEVM</p>
        <h1>USDp + sUSDp analytics built for verification.</h1>
        <p className="lede">
          An independent indexer for finalized protocol flows, vault state, and
          native Yield Paid Out.
        </p>
        <div className="status">
          <span>Phase 0</span>
          <strong>Foundation in progress</strong>
        </div>
      </section>

      <section className="checks" aria-labelledby="foundation-heading">
        <h2 id="foundation-heading">Foundation gate</h2>
        <ul>
          {phaseZeroChecks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
