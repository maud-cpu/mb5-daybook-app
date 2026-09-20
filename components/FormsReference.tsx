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
                  <b>{it.name}</b> — {it.note}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 8 }}>
          Names and exact paperwork vary a little by fostering service — if you&apos;re with Surrey, most of
          these live inside the{" "}
          <a href="https://surreyfch.trixonline.co.uk/" target="_blank" rel="noopener noreferrer">
            Surrey Foster Carers Handbook ↗
          </a>{" "}
          (policies, procedures and the forms themselves), alongside the general{" "}
          <a href="https://www.surreycc.gov.uk/children/social-care/fostering" target="_blank" rel="noopener noreferrer">
            Surrey fostering pages ↗
          </a>
          . For anything not there, your SSW can point you to the right one.
        </p>
      </div>
    </details>
  );
}
