export async function getAvatarUrl(userId) {

  if (!userId) return null;

  try {
    const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=420x420&format=Png&isCircular=false`);

    return response.ok ? (await response.json()).data?.[0]?.imageUrl || null : null;
  } catch (error) {
    console.error("[ROBLOX_THUMBNAIL]", error);

    return null;
  }
}

export async function getRobloxUserProfile(userId) {

  const normalized = String(userId);
  const [profileResponse, avatarUrl] = await Promise.all([
    fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(normalized)}`, { headers: { Accept: "application/json" } }),
    getAvatarUrl(normalized),
  ]);

  if (profileResponse.status === 404) return null;
  if (!profileResponse.ok) throw new Error(`Roblox respondió ${profileResponse.status}.`);

  const profile = await profileResponse.json();

  return {
    id: String(profile.id || normalized),
    username: String(profile.name || "Usuario desconocido"),
    displayName: String(profile.displayName || profile.name || "Usuario desconocido"),
    description: String(profile.description || "").slice(0, 600),
    created: profile.created || null,
    isBanned: Boolean(profile.isBanned),
    hasVerifiedBadge: Boolean(profile.hasVerifiedBadge),
    avatarUrl,
    profileUrl: `https://www.roblox.com/users/${encodeURIComponent(normalized)}/profile`,
  };
}
