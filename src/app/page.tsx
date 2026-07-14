const phaseOneChecks = [
  "Official deployment artifacts pinned",
  "Live proxy, facet, and collateral relationships verified",
  "Savings math and economic event ABIs executable",
  "DIA USDp and sUSDp market feeds verified",
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
          <span>Phase 1</span>
          <strong>Discovery candidate</strong>
        </div>
      </section>

      <section className="checks" aria-labelledby="discovery-heading">
        <h2 id="discovery-heading">Discovery gate</h2>
        <ul>
          {phaseOneChecks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
