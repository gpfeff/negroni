const PROFILE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function validateProfileId(profile: string): string {
  if (!PROFILE_RE.test(profile)) throw new Error("The Meta Ads Intelligence profile ID is invalid.");
  return profile;
}
