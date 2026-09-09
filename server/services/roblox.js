function numericId(value) {
  return /^[1-9]\d{0,19}$/.test(String(value || "")) ? String(value) : null;
}

async function json(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  return response.ok ? response.json() : null;
}

export async function getAvatarUrl(userId) {
  const id = numericId(userId);
  if (!id) return null;
  const data = await json(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(id)}&size=420x420&format=Png&isCircular=false`);
  return data?.data?.[0]?.imageUrl || null;
}

export async function getAvatarUrls(userIds) {
  const ids = [...new Set((userIds || []).map(numericId).filter(Boolean))];
  if (!ids.length) return {};
  const data = await json(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(ids.join(","))}&size=420x420&format=Png&isCircular=false`);
  return Object.fromEntries((data?.data || []).map((item) => [String(item.targetId), item.imageUrl]).filter(([, url]) => Boolean(url)));
}

export async function getItemThumbnailUrl(item) {
  const id = String(item?.id || "").trim();
  if (!/^\d{1,20}$/.test(id)) return null;
  const data = await json(`https://thumbnails.roblox.com/v1/assets?assetIds=${encodeURIComponent(id)}&size=420x420&format=Png&isCircular=false`);
  return data?.data?.[0]?.imageUrl || null;
}

export async function getGroupIconUrl() {
  return null;
}

export async function getRobloxUserProfile(userId) {
  const id = numericId(userId);
  if (!id) return null;
  const [profile, avatarUrl] = await Promise.all([json(`https://users.roblox.com/v1/users/${encodeURIComponent(id)}`), getAvatarUrl(id)]);
  if (!profile?.id) return null;
  return { id: String(profile.id), username: profile.name, displayName: profile.displayName, description: profile.description, created: profile.created, isBanned: Boolean(profile.isBanned), hasVerifiedBadge: Boolean(profile.hasVerifiedBadge), avatarUrl, profileUrl: `https://www.roblox.com/users/${id}/profile` };
}
