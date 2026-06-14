# TODO — SahaVahan Production Steps

## Step 5 — Ratings & Reviews After Ride Completion
- [x] Add “⭐ Leave Review” button in `makeRideCard()` for Completed rides (passenger side only)
- [x] Add Review Modal HTML + styling hook in `public/dashboard.html`
- [ ] Add JS: `openReviewModal()` + `submitReview()`


- [ ] Ensure review submit payload includes `reviewer` and `reviewedUser` using the ride object fields available in dashboard APIs

## Step 6 — Earnings System
- [ ] Update dashboard earnings fields after ride completion

## Step 7 — Trust Score System
- [ ] Apply trustScore adjustments on completion/report/review

## Step 8 — Ride History
- [ ] Implement GET `/api/rides/history/:userCode` rendering

## Step 9 — Driver Live Tracking
- [ ] Render passenger live driver location updates via Socket.IO

## Step 10 — Completion Screen
- [ ] Implement passenger+driver completion UI

