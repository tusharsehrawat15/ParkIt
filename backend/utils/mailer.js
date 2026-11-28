const nodemailer = require("nodemailer");

async function sendOtpEmail(toEmail, otp, purpose) {
  const subject =
    purpose === "SIGNUP"
      ? "ParkIt — Verify your email address"
      : purpose === "RESET"
      ? "ParkIt — Password reset verification code"
      : "ParkIt — Confirm account deletion";

  const message =
    purpose === "SIGNUP"
      ? "Use the code below to verify your email and complete your ParkIt registration:"
      : purpose === "RESET"
      ? "Use the code below to verify your identity and set a new password:"
      : "Use the code below to permanently delete your ParkIt account:";

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 460px; margin: auto; padding: 24px; background: #09090b; color: #fafafa; border-radius: 12px; border: 1px solid #27272a;">
      <h2 style="color: #10b981; margin-top: 0;">ParkIt Verification</h2>
      <p style="color: #a1a1aa; font-size: 14px;">${message}</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px; margin: 20px 0; background: #18181b; border-radius: 10px; color: #10b981;">
        ${otp}
      </div>
      <p style="color: #71717a; font-size: 12px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`\n========================================`);
    console.log(`[DEV OTP - ${purpose}] Email: ${toEmail} | Code: ${otp}`);
    console.log(`========================================\n`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"ParkIt" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html,
  });
}

module.exports = { sendOtpEmail };