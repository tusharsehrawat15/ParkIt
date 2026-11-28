const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendOtpEmail({ to, otp, subject = "Your ParkIt Verification Code" }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_USER;

  if (!apiKey) {
    throw new Error("Missing BREVO_API_KEY environment variable");
  }
  if (!senderEmail) {
    throw new Error("Missing EMAIL_USER environment variable");
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: "ParkIt",
        email: senderEmail,
      },
      to: [{ email: to }],
      subject,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>ParkIt Email Verification</h2>
          <p>Your 6-digit verification code is:</p>
          <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
          <p>This code will expire shortly. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
      textContent: `Your ParkIt verification code is: ${otp}`,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API request failed (${response.status}): ${errorBody}`);
  }

  return response.json();
}

module.exports = { sendOtpEmail };