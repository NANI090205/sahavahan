# TODO: Fix rides endpoints (user/booked) and remove corrupted code paths

## Completed
- [x] Removed `app.js` fallback that delegated `/api/rides/all` to corrupted `routes/rides.js`.
- [x] Verified `GET /api/rides/all` returns 200.

## Remaining
- [ ] Add `GET /api/rides/user/:uniqueCode` to `routes/rides.fixed.js`.
- [ ] Add `GET /api/rides/booked/:uniqueCode` to `routes/rides.fixed.js`.
- [ ] Verify:
  - [ ] `GET /api/rides/user/67602` returns 200 JSON
  - [ ] `GET /api/rides/booked/67602` returns 200 JSON


