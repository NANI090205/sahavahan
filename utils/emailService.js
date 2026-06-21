const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpEmail = async (email, otp) => {
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email,
    subject: "SahaVahan Verification OTP",
    html: `<h2>SahaVahan OTP Verification</h2><p>Your OTP is:</p><h1>${otp}</h1><p>This OTP expires in 10 minutes.</p>`
  });
};

const sendPasswordResetEmail = async (email, otp) => {
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email,
    subject: "SahaVahan Password Reset OTP",
    html: `<div style="font-family:Arial;padding:20px;"><h2>🔐 SahaVahan</h2><p>Your OTP is:</p><h1>${otp}</h1><p>Valid for 10 minutes.</p></div>`
  });
};

const sendRideBookingEmail = async (email, publishedBy, bookedBy, ride, seatsBooked, totalPrice, isPublisher = false) => {
  if (isPublisher) {
    return resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "🚗 Your Ride Has Been Booked!",
      html: `<h2>Hi ${publishedBy},</h2>
             <p>Your ride has been booked:</p>
             <ul>
                <li><strong>From:</strong> ${ride.source}</li>
                <li><strong>To:</strong> ${ride.destination}</li>
                <li><strong>Date:</strong> ${ride.date}</li>
                <li><strong>Time:</strong> ${ride.time}</li>
                <li><strong>Seats Booked:</strong> ${seatsBooked}</li>
                <li><strong>Total Price:</strong> ₹${totalPrice}</li>
             </ul>`
    });
  } else {
    return resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "✅ Booking Confirmed",
      html: `<h2>Hi ${bookedBy},</h2>
             <p>Your booking is confirmed:</p>
             <ul>
                <li><strong>From:</strong> ${ride.source}</li>
                <li><strong>To:</strong> ${ride.destination}</li>
                <li><strong>Date:</strong> ${ride.date}</li>
                <li><strong>Time:</strong> ${ride.time}</li>
                <li><strong>Seats:</strong> ${seatsBooked}</li>
                <li><strong>Total Price:</strong> ₹${totalPrice}</li>
             </ul>
             <p>– Carpooling Team</p>`
    });
  }
};

const sendRideCancellationEmail = async (email, username, isPublisher = false, ride, booking = null) => {
  if (isPublisher) {
    return resend.emails.send({
        from: "onboarding@resend.dev",
        to: email,
        subject: "❌ Booking has been Cancelled by User",
        html: `<h3>Hi ${username},</h3>
             <p><strong>${booking.bookedBy}</strong> has cancelled their booking for your ride.</p>
             <p>Freed Seats: ${booking.seatsBooked}</p>`
    });
  } else {
    return resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Ride Cancelled by Publisher",
      html: `<h3>Hi ${username},</h3>
             <p>Your booking from <strong>${ride.source}</strong> to <strong>${ride.destination}</strong> on <strong>${ride.date}</strong> has been cancelled by the publisher.</p>
             <p>Sorry for the inconvenience.</p>`
    });
  }
};

const sendEmergencyEmail = async (to, subject, text) => {
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: to,
    subject: subject,
    text: text
  });
};

const sendGenericEmail = async (to, subject, html) => {
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: to,
    subject: subject,
    html: html
  });
};

module.exports = {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendRideBookingEmail,
  sendRideCancellationEmail,
  sendEmergencyEmail,
  sendGenericEmail
};
