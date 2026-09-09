function trim(value, maximum = 1024) {
  const text = String(value || "");
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

export async function sendDiscord(url, embed) {
  if (!url) return false;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [embed] }) });
  if (!response.ok) throw new Error(`Discord respondió ${response.status}`);
  return true;
}

export function donationMessage(data, avatar, number, brandImage) {
  return { title: "Donación recibida", color: 0xe95d78, thumbnail: avatar ? { url: avatar } : undefined, author: { name: trim(data.displayName || data.username) }, footer: { text: `Donación #${number}`, icon_url: brandImage || undefined }, fields: [{ name: "Cantidad", value: `${Number(data.amount || 0).toLocaleString()} Robux`, inline: true }] };
}

export function singleMessage(data, avatar, number, itemImage, brandImage) {
  return { title: "Compra recibida", color: 0xe95d78, thumbnail: avatar ? { url: avatar } : undefined, image: itemImage ? { url: itemImage } : undefined, author: { name: trim(data.displayName || data.username) }, footer: { text: `Compra #${number}`, icon_url: brandImage || undefined }, fields: [{ name: "Artículo", value: trim(data.item?.name, 256) }, { name: "Precio", value: `${Number(data.item?.price || 0).toLocaleString()} Robux`, inline: true }] };
}

export function bulkMessage(data, avatar, number, brandImage) {
  const items = (data.items || []).map((item) => `• ${trim(item.name, 120)} — ${Number(item.price || 0).toLocaleString()} Robux`).join("\n");
  return { title: "Compra múltiple recibida", color: 0xe95d78, thumbnail: avatar ? { url: avatar } : undefined, author: { name: trim(data.displayName || data.username) }, footer: { text: `Compra bulk #${number}`, icon_url: brandImage || undefined }, fields: [{ name: "Artículos", value: trim(items || "Sin detalle") }] };
}

export function weeklySummary(stats, brandImage) {
  return { title: "Resumen semanal", color: 0xe95d78, footer: { text: stats.week, icon_url: brandImage || undefined }, fields: [
    { name: "Gastado", value: `${Number(stats.spent || 0).toLocaleString()} Robux`, inline: true },
    { name: "Revenue", value: `${Number(stats.revenue || 0).toLocaleString()} Robux`, inline: true },
    { name: "Compras", value: String(Number(stats.single || 0) + Number(stats.bulk || 0)), inline: true },
  ] };
}
