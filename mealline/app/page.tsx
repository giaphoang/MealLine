export default function Home() {
  return (
    <>
      <h1>Request pantry delivery assistance</h1>
      <p>
        MealLine helps people request existing food-delivery assistance through an
        ordinary phone call or an accessible text form. It collects and confirms
        the necessary information, presents a structured request to staff, and
        tracks approval, notification, and fulfillment separately.
      </p>
      <div className="notice" role="note">
        <strong>Demonstration.</strong> The pantry provider here is synthetic.
        A received request is <em>not</em> a confirmed delivery — staff review
        and approve every request.
      </div>

      <h2>Start a request</h2>
      <div className="card">
        <p>Choose the channel that works for you. English and Vietnamese.</p>
        <a className="btn" href="/intake">Start the accessible text form</a>
        <p className="muted">
          Prefer to talk? In the pilot, callers dial the pantry line and answer
          one question at a time. <a href="/simulator">Try the simulator</a> to
          see the same conversation without a phone.
        </p>
      </div>

      <h2>Already requested?</h2>
      <div className="card">
        <p>
          If you chose the secure status link during intake, open it to check
          your request — no phone call or account needed.
        </p>
      </div>

      <h2>For staff</h2>
      <div className="card">
        <p>Review the queue, verify program rules, and approve delivery options.</p>
        <a className="btn secondary" href="/staff">Open the staff dashboard</a>
      </div>
    </>
  );
}
