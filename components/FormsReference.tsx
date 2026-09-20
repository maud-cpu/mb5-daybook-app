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
          A few items above (marked ↗) link straight to the actual page. Most of the rest are Surrey/agency-specific
          paperwork that lives behind a log-in inside the{" "}
          <a href="https://surreyfch.trixonline.co.uk/" target="_blank" rel="noopener noreferrer">
            Surrey Foster Carers Handbook ↗
          </a>{" "}
          rather than as a public download, so a direct link isn&apos;t possible — the handbook (policies,
          procedures and the forms themselves) and the general{" "}
          <a href="https://www.surreycc.gov.uk/children/social-care/fostering" target="_blank" rel="noopener noreferrer">
            Surrey fostering pages ↗
          </a>{" "}
          are the places to look, or ask your SSW to point you to the right one.
        </p>
      </div>
    </details>
  );
}
