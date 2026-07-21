export async function getAvatarUrls(userIds = []) {

  const normalized = [...new Set(userIds.map(String).filter((userId) => /^[1-9]\d{0,19}$/.test(userId)))].slice(0, 20);

  if (!normalized.length) return {};

  try {
    const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(normalized.join(","))}&size=420x420&format=Png&isCircular=false`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return {};

    const result = await response.json();

    return Object.fromEntries((result.data || [])
      .filter((item) => item?.imageUrl && normalized.includes(String(item.targetId)))
      .map((item) => [String(item.targetId), item.imageUrl]));
  } catch (error) {
    console.error("[ROBLOX_THUMBNAIL]", error);

    return {};
  }
}

export async function getAvatarUrl(userId) {

  if (!userId) return null;

  return (await getAvatarUrls([userId]))[String(userId)] || null;
}

async function getThumbnailUrl(url, errorLabel) {

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    return response.ok ? (await response.json()).data?.[0]?.imageUrl || null : null;
  } catch (error) {
    console.error(errorLabel, error);

    return null;
  }
}

export async function getItemThumbnailUrl(item = {}) {

  if (!item.id) return null;

  const isBundle = String(item.AssetType || item.assetType || "").toLowerCase() === "bundle";
  const endpoint = isBundle
    ? `https://thumbnails.roblox.com/v1/bundles/thumbnails?bundleIds=${encodeURIComponent(item.id)}&size=420x420&format=Png&isCircular=false`
    : `https://thumbnails.roblox.com/v1/assets-thumbnail?assetIds=${encodeURIComponent(item.id)}&size=420x420&format=Png&isCircular=false`;

  return getThumbnailUrl(endpoint, "[ROBLOX_ITEM_THUMBNAIL]");
}

export async function getGroupIconUrl(groupId = 16939863) {

  return getThumbnailUrl(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${encodeURIComponent(groupId)}&size=420x420&format=Png&isCircular=false`, "[ROBLOX_GROUP_ICON]");
}

export async function getRobloxUserProfile(userId) {

  const normalized = String(userId);
  const [profileResponse, avatarUrl] = await Promise.all([
    fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(normalized)}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }),
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
