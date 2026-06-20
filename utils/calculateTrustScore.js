function calculateTrustScore(user){

let score = 50;

// Email Verified
if(user?.isEmailVerified)
score += 10;

// Phone Verified (Awarded if number exists since verification is bypassed)
if(user?.phoneNumber)
score += 10;

// Driver Verified
if(user?.isVerifiedDriver)
score += 15;

// Completed Rides
score += Math.min(
user?.completedRides || 0,
20
);

// Good Rating
if((user?.averageRating || 0) >= 4.5){
  score += 10;
}

// Low Rating Penalty
if((user?.averageRating || 0) < 3){
  score -= 15;
}

// Reports
score -= (user?.reportCount || 0) * 5;


score = Math.max(
0,
Math.min(100,score)
);

return score;
}

module.exports =
calculateTrustScore;

