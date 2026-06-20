const nodemailer = require("nodemailer");

let transporter;

if (process.env.NODE_ENV === "test") {
  transporter = {
    sendMail: async () => Promise.resolve(true)
  };
} else {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

module.exports = transporter;