import { FORMS_REFERENCE } from "@/lib/types";

export default function FormsReference() {
  return (
    <details>
      <summary>📄 Forms & documents — what a foster carer might need</summary>
      <div>
        {FORMS_REFERENCE.map((cat) => (
          <div key={cat.key} style={{ marginTop: 14 }}>
            <b style={{ display: "block", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--grey)" }}>
              {cat.label}
            </b>
            <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
              {cat.items.map((it) => (
                <li key={it.name} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.35 }}>
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noopener noreferrer">
                        {it.name} ↗
                      </a>
                    ) : (
                      it.name
                    )}
                  </div>
                  <div className="muted" style={{ marginTop: 2 }}>
                    {it.note}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 8 }}>
          Items marked ↗ link straight to the actual page — including the relevant chapter of the{" "}
          <a href="https://surreycs.trixonline.co.uk/contents/procedures#fostering-and-adoption" target="_blank" rel="noopener noreferrer">
            Surrey Children&apos;s Services Procedures Manual ↗
          </a>{" "}
          where one covers it. The few still unlinked are the actual forms/templates themselves rather than the
          procedure describing them — those live behind a log-in inside the{" "}
          <a href="https://surreyfch.trixonline.co.uk/" target="_blank" rel="noopener noreferrer">
            Surrey Foster Carers Handbook ↗
          </a>{" "}
          rather than as a public download, alongside the general{" "}
          <a href="https://www.surreycc.gov.uk/children/social-care/fostering" target="_blank" rel="noopener noreferrer">
            Surrey fostering pages ↗
          </a>
          . Ask your SSW for the actual template if you need one, not just the policy behind it.
        </p>
      </div>
    </details>
  );
}
