interface StatusView {
  caseNumber: string; status: string; language: string;
  contactPreference: string | null;
  approvedWindow: { label: string; start: string; end: string } | null;
  nextStep: string; updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", needs_review: "Under staff review",
  awaiting_followup: "Staff follow-up scheduled", approved: "Delivery scheduled",
  fulfilled: "Delivered", closed_without_service: "Closed without service",
  cancelled: "Cancelled",
};

const NEXT_STEP: Record<string, string> = {
  intake_in_progress: "Your answers are still being collected.",
  staff_review: "Staff are reviewing your request and checking the delivery details.",
  staff_followup: "A staff member will follow up with you about next steps.",
  delivery_scheduled: "Your delivery is scheduled. You will receive the details in your chosen language.",
  delivered: "This delivery was completed.",
  closed: "This request is closed. Contact the pantry if you still need help.",
};

function fmt(dt: string, lang: string): string {
  try {
    return new Date(dt).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
      weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return dt; }
}

export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = process.env.PUBLIC_BASE_URL ?? "";
  let view: StatusView | null = null;
  try {
    // Resolve server-side so the token never leaks to client JS unnecessarily.
    const { resolveStatusLink } = await import("@/lib/statusLinks");
    view = await resolveStatusLink(token);
  } catch { view = null; }
  void base;

  if (!view) {
    return (
      <>
        <h1>Request status</h1>
        <div className="alert" role="alert">
          <p><strong>This link is invalid or expired.</strong></p>
          <p>If you requested pantry delivery and need help, please start a new request or contact the pantry directly.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Request status</h1>
      <div className="card">
        <dl className="kv">
          <dt>Request</dt><dd className="mono">{view.caseNumber}</dd>
          <dt>Status</dt>
          <dd><span className={`status-pill status-${view.status}`}>{STATUS_LABEL[view.status] ?? view.status}</span></dd>
          <dt>What happens next</dt><dd>{NEXT_STEP[view.nextStep] ?? view.nextStep}</dd>
          {view.approvedWindow && (
            <>
              <dt>Scheduled window</dt>
              <dd>
                <strong>{view.approvedWindow.label}</strong><br />
                {fmt(view.approvedWindow.start, view.language)} – {fmt(view.approvedWindow.end, view.language)}
              </dd>
            </>
          )}
          <dt>Last updated</dt><dd>{fmt(view.updatedAt, view.language)}</dd>
        </dl>
        <p className="muted">
          A scheduled delivery is confirmed by staff. Delivery completion is
          recorded separately after the provider confirms it.
        </p>
      </div>
    </>
  );
}
