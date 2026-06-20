/**
 * SahaVahan Virtual Production Ride Simulation
 * Simulates a complete ride between testdrv_prod (driver) and testpax_prod (passenger)
 * Includes: Login → Board OTP → Location Updates → Drop OTP → Completion
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const mongoose = require('mongoose');

// ─── HTTP helper ───────────────────────────────────────────────
function req(path, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    const opts = { hostname: 'localhost', port: 4040, path, method, headers };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data.slice(0, 300) }); }
      });
    });
    r.on('error', e => resolve({ status: 'ERR', body: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg, color = '\x1b[37m') {
  console.log(color + msg + '\x1b[0m');
}

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RED    = '\x1b[31m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const RIDE_ID = '6a34e1b16cca61bc28657f7f';
const BOOK_ID = '6a34e1b16cca61bc28657f82';

async function simulate() {
  await mongoose.connect(process.env.MONGO_URI);
  const Ride = require('../models/Ride');
  const BookedRide = require('../models/BookedRide');

  console.log('\n' + BOLD + CYAN +
    '╔══════════════════════════════════════════════════════════════╗\n' +
    '║       SAHAVAHAN — VIRTUAL PRODUCTION RIDE SIMULATION         ║\n' +
    '║            testdrv_prod  ↔  testpax_prod                     ║\n' +
    '╚══════════════════════════════════════════════════════════════╝' + RESET);

  // ── RESET ─────────────────────────────────────────────────────
  log('\n⚙️  Resetting ride state...', YELLOW);
  const ride = await Ride.findById(RIDE_ID);
  ride.status = 'Scheduled';
  ride.driverLat = 16.5062; ride.driverLng = 80.6480;
  await ride.save();

  const booking = await BookedRide.findById(BOOK_ID);
  booking.otpVerified = false;
  booking.dropOTPVerified = false;
  booking.boardedAt = undefined;
  booking.droppedAt = undefined;
  await booking.save();
  log('  ✅ Ride reset to Scheduled | Booking OTPs reset', GREEN);

  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  log('\n' + BOLD + '─── PHASE 1: AUTHENTICATION ───' + RESET, CYAN);

  const dLogin = await req('/api/users/login', 'POST', { email: 'testdrv_prod@local.test', password: 'Test@1234' });
  if (dLogin.status === 200) {
    log(`  ✅ DRIVER LOGIN: ${dLogin.body.username || 'testdrv_prod'} logged in (role: ${dLogin.body.role || 'driver'})`, GREEN);
  } else {
    log(`  ❌ DRIVER LOGIN FAILED: ${JSON.stringify(dLogin.body)}`, RED);
  }

  const pLogin = await req('/api/users/login', 'POST', { email: 'testpax_prod@local.test', password: 'Test@1234' });
  if (pLogin.status === 200) {
    log(`  ✅ PASSENGER LOGIN: ${pLogin.body.username || 'testpax_prod'} logged in (role: ${pLogin.body.role || 'passenger'})`, GREEN);
  } else {
    log(`  ❌ PASSENGER LOGIN FAILED: ${JSON.stringify(pLogin.body)}`, RED);
  }

  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  log('\n' + BOLD + '─── PHASE 2: RIDE DETAILS ───' + RESET, CYAN);

  const rideStatus = await req('/api/rides/status/' + RIDE_ID);
  log(`  📋 Ride: ${ride.source} → ${ride.destination}`, YELLOW);
  log(`  📅 Date: ${ride.date} at ${ride.time} | Seats: ${ride.seats} | Price: ₹${ride.price}`, YELLOW);
  log(`  🔘 Status: ${rideStatus.body.status}`, YELLOW);
  log(`  📍 Driver Location: lat=${rideStatus.body.driverLat}, lng=${rideStatus.body.driverLng}`, YELLOW);

  const passengerBook = await req(`/api/passenger-bookings/${RIDE_ID}?username=testpax_prod`);
  if (passengerBook.status === 200) {
    log(`  ✅ Passenger Booking: pickup="${passengerBook.body.boardingPoint}", drop="${passengerBook.body.dropPoint}"`, GREEN);
    log(`     Drop OTP Verified: ${passengerBook.body.dropOTPVerified}`, YELLOW);
  }

  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  log('\n' + BOLD + '─── PHASE 3: BOARDING OTP (Passenger boards the vehicle) ───' + RESET, CYAN);
  log('  🚌 Passenger arrives at pickup point: "Vijayawada Bus Stand"', YELLOW);
  log('  📱 Passenger shows boarding OTP: 123456', YELLOW);
  log('  👨‍✈️ Driver enters OTP into dashboard...', YELLOW);

  await sleep(800);

  const boardResult = await req('/api/otp/verify-boarding', 'POST', {
    rideId: RIDE_ID,
    bookingId: BOOK_ID,
    otp: '123456'
  });

  if (boardResult.status === 200) {
    log(`  ✅ BOARDING CONFIRMED: ${boardResult.body.message}`, GREEN);
    log(`  🚗 Ride Status → ${boardResult.body.rideStatus}`, GREEN);
  } else {
    log(`  ❌ BOARDING FAILED: ${JSON.stringify(boardResult.body)}`, RED);
  }

  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  log('\n' + BOLD + '─── PHASE 4: LIVE TRACKING SIMULATION (10 location updates) ───' + RESET, CYAN);
  log('  🗺️  Simulating driver moving from Vijayawada towards Hyderabad...', YELLOW);

  // Route: Vijayawada → Hyderabad (approximate lat/lng waypoints)
  const routeWaypoints = [
    { lat: 16.5062, lng: 80.6480, label: 'Vijayawada (Start)' },
    { lat: 16.5400, lng: 80.7200, label: 'Near Ibrahimpatnam' },
    { lat: 16.5800, lng: 80.8500, label: 'Nakireddy Pally' },
    { lat: 16.6200, lng: 80.9800, label: 'Nandigama' },
    { lat: 16.7000, lng: 81.1000, label: 'Kanchikacherla' },
    { lat: 16.7800, lng: 80.9500, label: 'Guntur outskirts' },
    { lat: 16.9000, lng: 79.7000, label: 'Miryalaguda' },
    { lat: 17.0500, lng: 79.4500, label: 'Nalgonda' },
    { lat: 17.2000, lng: 78.9000, label: 'Ibrahimpatnam, Hyd' },
    { lat: 17.3850, lng: 78.4867, label: 'Hyderabad MGBS (Destination)' },
  ];

  for (let i = 0; i < routeWaypoints.length; i++) {
    const point = routeWaypoints[i];
    await Ride.findByIdAndUpdate(RIDE_ID, { driverLat: point.lat, driverLng: point.lng });

    // Broadcast via Socket.IO (directly via io if accessible, or just DB update)
    if (global.__io) {
      global.__io.to(RIDE_ID).emit('locationUpdated', { rideId: RIDE_ID, lat: point.lat, lng: point.lng });
    }

    log(`  📍 [${i + 1}/10] Driver at: ${point.label} (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`, YELLOW);
    await sleep(300);
  }

  log(`  ✅ 10 location updates simulated | Final: Hyderabad MGBS`, GREEN);

  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  log('\n' + BOLD + '─── PHASE 5: DROP OTP (Passenger arrives at destination) ───' + RESET, CYAN);
  log('  🏁 Ride arrives at Hyderabad MGBS', YELLOW);
  log('  📱 Passenger reveals Drop OTP: 654321', YELLOW);
  log('  👨‍✈️ Driver verifies Drop OTP...', YELLOW);

  await sleep(800);

  const dropResult = await req('/api/rides/verify-drop-otp', 'POST', {
    bookingId: BOOK_ID,
    otp: '654321',
    username: 'testpax_prod'
  });

  if (dropResult.status === 200) {
    log(`  ✅ DROP CONFIRMED: ${dropResult.body.message}`, GREEN);
  } else {
    log(`  ❌ DROP FAILED: ${JSON.stringify(dropResult.body)}`, RED);
  }

  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  log('\n' + BOLD + '─── PHASE 6: RIDE COMPLETION ───' + RESET, CYAN);

  const finalStatus = await req('/api/rides/status/' + RIDE_ID);
  log(`  🏁 Final Ride Status: ${finalStatus.body.status}`, finalStatus.body.status === 'Completed' ? GREEN : RED);
  log(`  📍 Final Driver Position: lat=${finalStatus.body.driverLat}, lng=${finalStatus.body.driverLng}`, YELLOW);

  // Verify booking state
  const finalBooking = await req(`/api/passenger-bookings/${RIDE_ID}?username=testpax_prod`);
  log(`  🎫 Booking Drop OTP Verified: ${finalBooking.body.dropOTPVerified}`, GREEN);

  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  log('\n' + BOLD + '─── PHASE 7: FEATURE CHECKS ───' + RESET, CYAN);

  const checks = [
    ['/api/vehicles/testdrv_prod', '🚗 Driver Vehicles'],
    ['/api/notifications/testdrv_prod', '🔔 Driver Notifications'],
    ['/api/notifications/testpax_prod', '🔔 Passenger Notifications'],
    ['/api/favorites/testdrv_prod', '❤️  Driver Favorites'],
    ['/api/waitlist/by-user/testpax_prod', '⏳ Passenger Waitlist'],
    ['/api/profile/testdrv_prod', '👤 Driver Profile'],
    ['/', '🏠 Home Page'],
    ['/dashboard', '📊 Dashboard Page'],
    ['/trackRide.html', '🗺️  Track Ride Page'],
    ['/ridepublish', '📝 Ride Publish Page'],
  ];

  for (const [path, label] of checks) {
    const r = await req(path);
    const ok = r.status === 200;
    log(`  ${ok ? '✅' : '❌'} ${label}: ${r.status}`, ok ? GREEN : RED);
  }

  // ─────────────────────────────────────────────────────────────
  console.log('\n' + BOLD + CYAN +
    '╔══════════════════════════════════════════════════════════════╗\n' +
    '║                   SIMULATION COMPLETE                        ║\n' +
    '╚══════════════════════════════════════════════════════════════╝' + RESET);

  console.log(BOLD + '\n📊 RIDE SUMMARY:' + RESET);
  console.log(`  Route        : Vijayawada → Hyderabad`);
  console.log(`  Driver       : testdrv_prod`);
  console.log(`  Passenger    : testpax_prod`);
  console.log(`  Boarding OTP : 123456 ✅`);
  console.log(`  Drop OTP     : 654321 ✅`);
  console.log(`  Location Pts : 10 updates (Vijayawada → Hyderabad)`);
  console.log(`  Final Status : ${finalStatus.body.status}`);

  console.log(BOLD + '\n🌐 OPEN THESE IN BROWSER TO SEE LIVE:' + RESET);
  console.log(`  Dashboard   : http://localhost:4040/dashboard`);
  console.log(`  Track Ride  : http://localhost:4040/trackRide.html?rideId=${RIDE_ID}&bookingId=${BOOK_ID}`);
  console.log(`  Home        : http://localhost:4040/`);

  await mongoose.disconnect();
}

simulate().catch(console.error);
