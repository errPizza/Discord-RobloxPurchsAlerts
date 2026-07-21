const EMOJI = {
  verified: "<:Verificado:1441221673540911196>",
  ping: "<a:ping:1398387011366158356>",
  member: "<:Member:1421793084349485116>",
  staff: "<:headstaff:1421793573640212572>",
  developer: "<:headdeveloper:1421793561187319848>",
  gift: "<:gifter:1438158241908396203>",
  robux: "<:RobuxIcon:1513312643073573028>",
  item: "<a:FakeNitroEmoji:1397199158393180250>",
  listItem: "<a:emoji_81:1427445383625183377>",
  revenue: "<:BulkPurchase:1513431101257810000>",
  single: "<:IndvidualItem:1513431023395016785>",
  bulk: "<:ShopCart:1513431174977163274>",
  donations: "<:Gift:1497093325176442991>",
};

function text(value, fallback = "—") {
  const normalized = String(value ?? "").trim();

  return normalized || fallback;
}

function robux(value) {
  return `${(Number(value) || 0).toLocaleString()} ${EMOJI.robux}`;
}

function media(url) {
  return url ? { url } : undefined;
}

function author(name, iconUrl) {
  return iconUrl ? { name, icon_url: iconUrl } : { name };
}

function trimEmbedText(value, maximum = 1024) {
  const normalized = text(value, "Sin información");

  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
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

export function donationMessage(data, avatarUrl, number, brandImageUrl = null) {
  const revenue = Math.floor((Number(data.amount) || 0) * 0.7);

  return {
    content: "# ¡Nueva Donación Recibida!\nSe ha detectado una nueva donación en **🛍 Another Game More Studio**.\n-# ¡Eso es! Continúen apoyando al estudio.\n",
    embeds: [{
      title: data.isStudio ? `${EMOJI.ping} Donación simulada` : `Donación verificada ${EMOJI.verified}`,
      description: "Información del jugador:",
      color: 0x99ff00,
      author: author(`${text(data.displayName)} (@${text(data.username, "desconocido")})`, avatarUrl),
      thumbnail: media(brandImageUrl),
      fields: [
        { name: `${EMOJI.member} Display Name`, value: text(data.displayName), inline: true },
        { name: `${EMOJI.member} Username`, value: text(data.username), inline: true },
        { name: `${EMOJI.staff} UserId`, value: text(data.userId), inline: true },
        { name: `${EMOJI.gift} Donación`, value: robux(data.amount), inline: true },
        { name: "👻 Ganancia", value: robux(revenue), inline: true },
      ],
      footer: { text: `Esta es la donación número ${number} de esta semana :D` },
      timestamp: new Date().toISOString(),
    }],
  };
}

export function singleMessage(data, avatarUrl, number, itemImageUrl = null, brandImageUrl = null) {
  const item = data.item || {};
  const percent = Math.floor((Number(item.percent) || 0) * 100);

  return {
    content: "# ¡Nueva Compra Recibida!\nSe ha detectado una nueva compra en **🛍 Another Game More Studio**.\n-# ¡Eso es! Continúen comprando.\n",
    embeds: [{
      title: data.isStudio ? `${EMOJI.ping} Compra individual simulada` : `Compra individual verificada ${EMOJI.verified}`,
      description: "Información de la compra:",
      color: 0x00ffcc,
      author: author(`Comprador: ${text(data.displayName)} (@${text(data.username, "desconocido")})`, avatarUrl),
      thumbnail: media(itemImageUrl),
      image: media(brandImageUrl),
      fields: [
        { name: `${EMOJI.item} Item`, value: text(item.name, "Sin nombre"), inline: true },
        { name: `${EMOJI.staff} AssetId`, value: text(item.id), inline: true },
        { name: "💳 Precio", value: robux(item.price), inline: true },
        { name: "💰 Ganancia", value: `${robux(item.revenue)} [ ${percent}% ]`, inline: true },
      ],
      footer: { text: `Esta es la compra número ${number} de esta semana :D` },
      timestamp: new Date().toISOString(),
    }],
  };
}

export function bulkMessage(data, avatarUrl, number, brandImageUrl = null) {
  const items = (data.items || []).slice(0, 25).map((item) => `${EMOJI.listItem} **${text(item.name, "Sin nombre")}** ( ${robux(item.price)} | Ganancia: ${Number(item.revenue) || 0} )`).join("\n");

  return {
    embeds: [{
      title: data.isStudio ? `${EMOJI.ping} Compra bulk simulada` : `Compra bulk verificada ${EMOJI.verified}`,
      description: "Información de la compra bulk:",
      color: 0xfee75c,
      author: author(`Comprador: ${text(data.displayName)} (@${text(data.username, "desconocido")})`, avatarUrl),
      thumbnail: media(brandImageUrl),
      fields: [
        { name: "🛒 Cantidad de items", value: String(Number(data.itemCount) || (data.items || []).length), inline: true },
        { name: `${EMOJI.robux} Total gastado`, value: robux(data.totalRobux), inline: true },
        { name: "💰 Ganancia total", value: robux(data.totalRevenue), inline: true },
        { name: "Items comprados", value: trimEmbedText(items || "Sin items") },
      ],
      footer: { text: `Esta es la compra número ${number} de esta semana :D` },
      timestamp: new Date().toISOString(),
    }],
  };
}

export function weeklySummary(data, brandImageUrl = null) {
  return {
    embeds: [{
      title: `${EMOJI.developer} Resumen semanal de ganancias`,
      color: 0xffff00,
      thumbnail: media(brandImageUrl),
      fields: [
        { name: "📅 Semana", value: text(data.week), inline: true },
        { name: "💸 Total gastado", value: robux(data.spent), inline: true },
        { name: `${EMOJI.revenue} Total generado`, value: robux(data.revenue), inline: true },
        { name: `${EMOJI.single} Compras individuales`, value: String(Number(data.single) || 0), inline: true },
        { name: `${EMOJI.bulk} Compras bulk`, value: String(Number(data.bulk) || 0), inline: true },
        { name: `${EMOJI.donations} Donaciones`, value: String(Number(data.donations) || 0), inline: true },
      ],
      footer: { text: "Informe de ingresos semanales — Another Game More Studio" },
      timestamp: new Date().toISOString(),
    }],
  };
}
