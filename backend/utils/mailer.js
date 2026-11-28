const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

async function sendOtpEmail(arg1, otpArg) {
  const isObject = typeof arg1 === "object" && arg1 !== null;
  const rawEmail = isObject ? (arg1.to ?? arg1.email) : arg1;
  const otp = isObject ? arg1.otp : otpArg;

  const recipientEmail = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const apiKey = typeof process.env.BREVO_API_KEY === "string" ? process.env.BREVO_API_KEY.trim() : "";
  const senderEmail = typeof process.env.EMAIL_USER === "string" ? process.env.EMAIL_USER.trim() : "";

  if (!recipientEmail) {
    throw new Error("Recipient email is missing in controller/request payload");
  }
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is missing in Render environment");
  }
  if (!senderEmail) {
    throw new Error("EMAIL_USER is missing in Render environment");
  }

  const response = await fetch(BREVO_ENDPOINT, {
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
      to: [{ email: recipientEmail }],
      subject: "Your ParkIt Verification Code",
      htmlContent: `<p>Your 6-digit ParkIt verification code is: <strong>${otp}</strong></p>`,
      textContent: `Your ParkIt verification code is: ${otp}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

module.exports = { sendOtpEmail };