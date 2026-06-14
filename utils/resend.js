const { Resend } = require("resend");

if (!process.env.RESEND_API_KEY) {
  console.error(
    "❌ RESEND_API_KEY is missing. Set it in your environment variables."
  );
}

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = resend;



