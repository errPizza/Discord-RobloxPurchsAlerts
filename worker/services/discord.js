export async function getAvatarUrl(userId) {

  if (!userId) return null;

  try {
    const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`);
    
    return response.ok ? (await response.json()).data?.[0]?.imageUrl || null : null;
  } catch (error) {

    console.error("[THUMBNAIL]", error);

    return null;
  }
}

export async function sendDiscord(webhookUrl, payload) {

  if (!webhookUrl) throw new Error("El webhook correspondiente no está configurado.");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(await response.text());
}

export function donationMessage(data, avatarUrl, number) {

  const revenue = Math.floor((Number(data.amount) || 0) * 0.7);

  return { content: "# ¡Nueva Donación Recibida!\nSe ha detectado una nueva donación en **Another Game More Studio**.", embeds: [{
    title: data.isStudio ? "Donación simulada" : "Donación verificada", color: 0x99ff00,
    author: { name: `${data.displayName} (@${data.username})`, icon_url: avatarUrl },
    fields: [{ name: "Usuario", value: String(data.displayName), inline: true }, { name: "UserId", value: String(data.userId), inline: true }, { name: "Donación", value: `${Number(data.amount || 0).toLocaleString()} Robux`, inline: true }, { name: "Ganancia", value: `${revenue.toLocaleString()} Robux`, inline: true }],
    footer: { text: `Donación número ${number} de esta semana` }, timestamp: new Date().toISOString(),
  }] };
}

export function singleMessage(data, avatarUrl, number) {

  const item = data.item || {};

  return { content: "# ¡Nueva Compra Recibida!\n**Another Game More Studio** detectó una compra.", embeds: [{
    title: data.isStudio ? "Compra individual simulada" : "Compra individual verificada", color: 0x00ffcc,
    author: { name: `Comprador: ${data.displayName} (@${data.username})`, icon_url: avatarUrl },
    fields: [{ name: "Item", value: String(item.name || "Sin nombre"), inline: true }, { name: "AssetId", value: String(item.id || "—"), inline: true }, { name: "Precio", value: `${Number(item.price || 0).toLocaleString()} Robux`, inline: true }, { name: "Ganancia", value: `${Number(item.revenue || 0).toLocaleString()} Robux`, inline: true }],
    footer: { text: `Compra número ${number} de esta semana` }, timestamp: new Date().toISOString(),
  }] };
}

export function bulkMessage(data, avatarUrl, number) {

  const items = (data.items || []).slice(0, 25).map((item) => `• **${item.name}** (${item.price} Robux | Ganancia: ${item.revenue || 0})`).join("\n");

  return { embeds: [{
    title: data.isStudio ? "Compra bulk simulada" : "Compra bulk verificada", color: 0xfee75c,
    author: { name: `Comprador: ${data.displayName} (@${data.username})`, icon_url: avatarUrl }, description: items || "Sin items",
    fields: [{ name: "Cantidad de items", value: String(data.itemCount || 0), inline: true }, { name: "Total gastado", value: `${Number(data.totalRobux || 0).toLocaleString()} Robux`, inline: true }, { name: "Ganancia total", value: `${Number(data.totalRevenue || 0).toLocaleString()} Robux`, inline: true }],
    footer: { text: `Compra número ${number} de esta semana` }, timestamp: new Date().toISOString(),
  }] };
}

export function weeklySummary(data) {

  return { embeds: [{
    title: "Resumen semanal de ganancias — Another Game More Studio", color: 0xffff00,
    fields: [{ name: "Semana", value: data.week, inline: true }, { name: "Total gastado", value: `${Number(data.spent).toLocaleString()} Robux`, inline: true }, { name: "Total generado", value: `${Number(data.revenue).toLocaleString()} Robux`, inline: true }, { name: "Compras individuales", value: String(data.single), inline: true }, { name: "Compras bulk", value: String(data.bulk), inline: true }, { name: "Donaciones", value: String(data.donations), inline: true }],
    footer: { text: "Informe de ingresos semanales" }, timestamp: new Date().toISOString(),
  }] };
}
