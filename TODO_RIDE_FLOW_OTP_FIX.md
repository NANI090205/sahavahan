# TODO: Ride flow OTP verification fixes

## Information gathered
- `routes/rides.fixed.js` contains `/start/:rideId` and `/complete/:rideId`.
- `Ride` model status enum: `Scheduled | In Progress | Completed | Cancelled`.
- `BookedRide` model includes OTP fields:
  - `boardingOTP`, `otpVerified` (boarding verified)
  - `dropOTP`, `dropOTPVerified` (drop verified)

## Plan
1. **Fix completion logic** in `routes/rides.fixed.js`:
   - In `/complete/:rideId`, before setting `ride.status = 'Completed'`, verify that:
     - all related `BookedRide` docs for that `rideId` have `dropOTPVerified: true`.
   - If any passenger is still not verified, return 400 and do not complete.
2. **Fix start logic** (optional but recommended):
   - In `/start/:rideId`, before allowing status change to `In Progress`, ensure there is at least one `BookedRide` for that `rideId`.
   - Stricter gate: require `otpVerified: true` for all passengers (or at least one passenger / all passengers—choose rule).
3. **Status semantics** (non-breaking):
   - Since `Ride` model enum does not include `Boarded`, we will keep `Ride.status` as-is and rely on `BookedRide.otpVerified` and `BookedRide.dropOTPVerified`.
4. **Testing**:
   - Smoke test start/complete endpoints with sample booked rides.
   - Confirm driver cannot complete before drop OTP verification.

## Followup steps
- Run node app / hit endpoints via Postman/browser.
- Check logs/notifications.

