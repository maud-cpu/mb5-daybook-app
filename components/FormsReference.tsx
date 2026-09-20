import { FORMS_REFERENCE } from "@/lib/types";

export default function FormsReference() {
  return (
    <details>
      <summary>📄 Forms & documents — what a foster carer might need</summary>
      <div>
        {FORMS_REFERENCE.map((cat) => (
          <div key={cat.key} style={{ marginTop: 10 }}>
            <b>{cat.label}</b>
            <ul>
              {cat.items.map((it) => (
                <li key={it.name}>
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noopener noreferrer">
                      <b>{it.name} ↗</b>
                    </a>
                  ) : (
                    <b>{it.name}</b>
                  )}{" "}
                  — {it.note}
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
