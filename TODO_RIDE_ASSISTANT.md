# TODO_RIDE_ASSISTANT

- [ ] Update `routes/assistant.js` to answer availability queries like:
  - "Available from Vijayawada to Hyderabad today?"
  - "Find rides ... today"
- [ ] Add route parsing for `from {source} to {destination}` + optional time qualifier (today/tomorrow).
- [ ] Query DB directly as fallback when ride search endpoint is down.
- [ ] Return ranked list (top 5) including:
  - driver (username)
  - departure time
  - price
  - available seats
  - (optional) trust/rating if already computable.
- [ ] Add price intent support:
  - "Price for route {source} to {destination}" via recommended-price multiplier logic.
- [x] Verify assistant response format remains `{ response: ... }`.
- [ ] Quick runtime test by calling assistant endpoint manually.


