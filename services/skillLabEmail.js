const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendInterviewResultEmail({
  student,
  attemptId,
  roleTitle,
  score,
  outcome,
  offer,
}) {
  if (!resend || !process.env.RESEND_FROM_EMAIL) {
    console.warn(
      "Interview email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is missing."
    );

    return {
      sent: false,
      reason: "missing_configuration",
    };
  }

  if (!student?.email) {
    return {
      sent: false,
      reason: "missing_student_email",
    };
  }

  const passed = score >= 70;

  const safeName = escapeHtml(student.fullName || "Student");
  const safeRole = escapeHtml(roleTitle || "Splunk Professional");
  const safeOutcome = escapeHtml(outcome || "");
  const frontendUrl =
    process.env.SKILL_LAB_FRONTEND_URL ||
    "https://www.to-analytics.com/toskillab";

  const offerSection =
    passed && offer
      ? `
        <div style="
          margin:24px 0;
          padding:22px;
          border:1px solid #a7f3d0;
          border-radius:16px;
          background:#ecfdf5;
        ">
          <div style="
            color:#047857;
            font-size:12px;
            font-weight:700;
            letter-spacing:1.5px;
          ">
            VIRTUAL JOB OFFER
          </div>

          <h2 style="margin:10px 0 8px;color:#172033;">
            ${escapeHtml(offer.company)}
          </h2>

          <p style="margin:0;line-height:1.7;color:#475569;">
            Position level:
            <strong>${escapeHtml(offer.job_level)}</strong>
            <br />

            Virtual salary:
            <strong>
              ${Number(offer.virtual_salary || 0).toLocaleString()}
              TO Credits
            </strong>
          </p>
        </div>
      `
      : `
        <div style="
          margin:24px 0;
          padding:22px;
          border:1px solid #fde68a;
          border-radius:16px;
          background:#fffbeb;
        ">
          <div style="
            color:#a16207;
            font-size:12px;
            font-weight:700;
            letter-spacing:1.5px;
          ">
            YOUR NEXT STEP
          </div>

          <h2 style="margin:10px 0 8px;color:#172033;">
            Keep building your interview skills
          </h2>

          <p style="margin:0;line-height:1.7;color:#475569;">
            Review the answer explanations in TO Skill Lab and try another
            interview when you are ready. A score of 70% or higher unlocks
            a virtual job offer.
          </p>
        </div>
      `;

  const subject = passed
    ? `You passed your ${roleTitle} interview`
    : `Your ${roleTitle} interview result`;

  const { data, error } = await resend.emails.send(
    {
      from: process.env.RESEND_FROM_EMAIL,
      to: [student.email],
      subject,
      html: `
        <div style="
          background:#f5f7fb;
          padding:32px 16px;
          font-family:Arial,sans-serif;
          color:#172033;
        ">
          <div style="
            max-width:620px;
            margin:auto;
            background:#ffffff;
            border:1px solid #e5e7eb;
            border-radius:20px;
            overflow:hidden;
          ">
            <div style="background:#0b1020;padding:30px;color:#ffffff;">
              <div style="
                color:#d8b4fe;
                font-size:13px;
                font-weight:700;
                letter-spacing:2px;
              ">
                TO SKILL LAB
              </div>

              <h1 style="margin:12px 0 0;font-size:30px;">
                Interview completed
              </h1>
            </div>

            <div style="padding:30px;">
              <p style="margin-top:0;font-size:17px;line-height:1.7;">
                Hello <strong>${safeName}</strong>,
              </p>

              <p style="font-size:17px;line-height:1.7;">
                You completed the
                <strong>${safeRole}</strong> interview.
              </p>

              <div style="
                margin:22px 0;
                padding:22px;
                border-radius:16px;
                background:#f8fafc;
                text-align:center;
              ">
                <div style="font-size:13px;color:#64748b;">
                  Interview score
                </div>

                <div style="
                  margin:6px 0;
                  font-size:46px;
                  font-weight:800;
                  color:${passed ? "#059669" : "#7c3aed"};
                ">
                  ${Number(score)}%
                </div>

                <div style="font-weight:700;color:#334155;">
                  ${safeOutcome}
                </div>
              </div>

              ${offerSection}

              <a
                href="${frontendUrl}"
                style="
                  display:inline-block;
                  margin-top:8px;
                  padding:14px 22px;
                  border-radius:10px;
                  background:#4f46e5;
                  color:#ffffff;
                  font-weight:700;
                  text-decoration:none;
                "
              >
                Review interview result
              </a>

              <p style="
                margin-top:28px;
                color:#64748b;
                font-size:12px;
                line-height:1.6;
              ">
                TO Skill Lab job offers and TO Credits are simulated learning
                features. They are not real employment or cash payments.
              </p>
            </div>
          </div>
        </div>
      `,
    },
    {
      idempotencyKey: `skill-lab-result-${attemptId}`,
    }
  );

  if (error) {
    console.error("Resend interview-result email failed:", {
      attemptId,
      message: error.message,
    });

    return {
      sent: false,
      reason: error.message,
    };
  }

  return {
    sent: true,
    emailId: data?.id || null,
  };
}

module.exports = {
  sendInterviewResultEmail,
};