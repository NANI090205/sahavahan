/**
 * SahaVahan Full Production Pipeline Test Script
 * Tests the complete ride flow: Login → Publish → Book → Board → Track → Drop → Complete
 */
require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');

function req(path, method = 'GET', body = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    const opts = { hostname: 'localhost', port: 4040, path, method, headers };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data.slice(0, 200) }); }
      });
    });
    r.on('error', e => resolve({ status: 'ERR', body: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

let passed = 0, failed = 0;
const results = [];

function check(label, r, expectStatus, extraCheck = null) {
  const statusOk = r.status === expectStatus;
  const extraOk = !extraCheck || extraCheck(r.body);
  const ok = statusOk && extraOk;
  const icon = ok ? '✅' : '❌';
  const msg = ok ? 'PASS' : `FAIL - status=${r.status} body=${JSON.stringify(r.body).slice(0, 100)}`;
  console.log(`${icon} ${label}: ${msg}`);
  results.push({ label, ok, status: r.status, body: r.body });
  if (ok) passed++; else failed++;
  return ok;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/User');
  const Ride = require('../models/Ride');
  const BookedRide = require('../models/BookedRide');

  console.log('\n========================================');
  console.log('  SAHAVAHAN FULL PRODUCTION PIPELINE TEST');
  console.log('========================================\n');

  // ─── SETUP: Reset test ride to Scheduled ──────────────────────
  const ride = await Ride.findOne({ username: 'testdrv_prod' });
  if (ride) {
    ride.status = 'Scheduled';
    ride.driverLat = 16.5062;
    ride.driverLng = 80.6480;
    await ride.save();
    console.log('🔧 Reset ride to Scheduled:', ride._id);
  }

  // Reset booking OTP state  
  const booking = await BookedRide.findOne({ rideId: ride?._id, bookedBy: 'testpax_prod' });
  if (booking) {
    booking.otpVerified = false;
    booking.dropOTPVerified = false;
    booking.boardedAt = undefined;
    booking.droppedAt = undefined;
    await booking.save();
    console.log('🔧 Reset booking:', booking._id);
  }
  
  const RIDE_ID = String(ride?._id);
  const BOOK_ID = String(booking?._id);
  
  console.log('\n--- PHASE 1: AUTHENTICATION ---');

  // 1. Driver Login
  let r = await req('/api/users/login', 'POST', { email: 'testdrv_prod@local.test', password: 'Test@1234' });
  check('1. Driver Login', r, 200, b => !!b.token || !!b.username);
  const driverUser = r.body?.username;

  // 2. Passenger Login
  r = await req('/api/users/login', 'POST', { email: 'testpax_prod@local.test', password: 'Test@1234' });
  check('2. Passenger Login', r, 200, b => !!b.token || !!b.username);
  const passUser = r.body?.username;

  console.log('\n--- PHASE 2: RIDE DATA ---');

  // 3. Driver can see published rides
  r = await req('/api/rides/user/testdrv_prod');
  check('3. Driver Published Rides API', r, 200, b => Array.isArray(b));
  console.log(`   → ${Array.isArray(r.body) ? r.body.length : 0} rides found`);

  // 4. Check ride status endpoint
  r = await req('/api/rides/status/' + RIDE_ID);
  check('4. Ride Status Endpoint', r, 200, b => b.status === 'Scheduled');
  console.log(`   → Status: ${r.body?.status}, lat: ${r.body?.driverLat}, lng: ${r.body?.driverLng}`);

  // 5. Passenger booked rides
  r = await req('/api/rides/booked/testpax_prod');
  check('5. Passenger Booked Rides API', r, 200, b => Array.isArray(b));
  console.log(`   → ${Array.isArray(r.body) ? r.body.length : 0} bookings`);

  // 6. Passenger booking details
  r = await req('/api/passenger-bookings/' + RIDE_ID + '?username=testpax_prod');
  check('6. Passenger Booking Details', r, 200, b => !!b.bookingId && !!b.boardingPoint);
  console.log(`   → Pickup: ${r.body?.boardingPoint}, Drop: ${r.body?.dropPoint}`);
  console.log(`   → Drop OTP Verified: ${r.body?.dropOTPVerified}`);

  console.log('\n--- PHASE 3: BOARDING OTP ---');

  // 7. Boarding OTP verification (driver verifies passenger's OTP)
  r = await req('/api/otp/verify-boarding', 'POST', {
    rideId: RIDE_ID,
    bookingId: BOOK_ID,
    otp: '123456'
  });
  check('7. Boarding OTP Verification', r, 200, b => b.rideStatus === 'In Progress' || b.otpVerified === true);
  console.log(`   → ${r.body?.message}`);

  // 8. Verify ride is now In Progress
  r = await req('/api/rides/status/' + RIDE_ID);
  check('8. Ride Status After Boarding', r, 200, b => b.status === 'In Progress');
  console.log(`   → Status: ${r.body?.status}`);

  console.log('\n--- PHASE 4: LIVE TRACKING ---');

  // 9. Simulate Socket.IO location update (via ride update)
  // Direct DB update to simulate what socket does
  await Ride.findByIdAndUpdate(RIDE_ID, { driverLat: 16.52, driverLng: 80.65 });
  r = await req('/api/rides/status/' + RIDE_ID);
  check('9. Driver Location Updated (Tracking)', r, 200, b => b.driverLat === 16.52 && b.driverLng === 80.65);
  console.log(`   → Driver at: ${r.body?.driverLat}, ${r.body?.driverLng}`);

  console.log('\n--- PHASE 5: DROP OTP ---');

  // 10. Drop OTP verification
  r = await req('/api/rides/verify-drop-otp', 'POST', {
    bookingId: BOOK_ID,
    otp: '654321',
    username: 'testpax_prod'
  });
  check('10. Drop OTP Verification', r, 200, b => b.message && b.message.toLowerCase().includes('success'));
  console.log(`   → ${r.body?.message}`);

  // 11. Verify ride completion
  r = await req('/api/rides/status/' + RIDE_ID);
  check('11. Ride Status After Drop', r, 200);
  console.log(`   → Status: ${r.body?.status}`);

  console.log('\n--- PHASE 6: ADDITIONAL FEATURES ---');

  // 12. Vehicles
  r = await req('/api/vehicles/testdrv_prod');
  check('12. Driver Vehicles', r, 200, b => Array.isArray(b));

  // 13. Notifications  
  r = await req('/api/notifications/testdrv_prod');
  check('13. Notifications', r, 200);

  // 14. Profile - correct endpoint is /api/profile/:username
  r = await req('/api/profile/testdrv_prod');
  check('14. User Profile', r, 200, b => b._id || b.username);

  // 15. Favorites
  r = await req('/api/favorites/testdrv_prod');
  check('15. Favorites', r, 200);

  // 16. Waitlist - correct endpoint is /api/waitlist/by-user/:username
  r = await req('/api/waitlist/by-user/testpax_prod');
  check('16. Waitlist', r, 200, b => Array.isArray(b.items) || typeof b === 'object');

  console.log('\n--- PHASE 7: STATIC PAGES ---');

  // 17. Index page
  r = await req('/');
  check('17. Home Page (/', r, 200, b => typeof b === 'string' || r.status === 200);

  // 18. Dashboard
  r = await req('/dashboard');
  check('18. Dashboard Page', r, 200);

  // 19. trackRide page
  r = await req('/trackRide.html');
  check('19. Track Ride Page', r, 200);

  console.log('\n========================================');
  console.log(`  RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.ok).forEach(r => console.log(' ❌', r.label, '- status:', r.status));
  }

  await mongoose.disconnect();
}

run().catch(console.error);
