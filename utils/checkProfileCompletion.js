const checkProfileCompletion = (user) => {
  if (!user) return false;

  const hasUsername = !!user.username;
  const hasEmail = !!user.email;
  const isEmailVerified = !!user.isEmailVerified;

  // NOTE:
  // Publishing should not be blocked by phone/profile/vehicle presence.
  // Vehicle validity is enforced at publish-time (see routes/rides.js).

  return (
    hasUsername &&
    hasEmail &&
    isEmailVerified
  );
};

module.exports = checkProfileCompletion;


