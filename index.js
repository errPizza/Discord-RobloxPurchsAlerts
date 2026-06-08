const MY_CREATOR_ID = 802409113;

function getWeekKey() {

	const now = new Date();

	const start = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			0,
			1
		)
	);

	const day = Math.floor(
		(now - start) / 86400000
	);

	const week = Math.ceil(
		(day + start.getUTCDay() + 1)
		/ 7
	);

	return `${now.getUTCFullYear()}-W${week}`;
}

async function updateWeeklyStats(
	env,
	payload
) {

	const weekKey = getWeekKey();

	const raw =
		await env.WEEKLY_STATS.get(
			weekKey
		);

	let stats;

	try {

		stats = raw
			? JSON.parse(raw)
			: null;

	}
	catch (err) {

		console.error(
			"[STATS] Error al leer KV:",
			err
		);

		stats = null;

	}

	if (!stats) {

		stats = {

			week: weekKey,
			createdAt: Date.now(),

			spent: 0,
			revenue: 0,

			single: 0,
			bulk: 0,
			donations: 0

		};

	}

	if (
		payload.type ===
		"Donation"
	) {

		const amount =
			Number(payload.amount) || 0;

		stats.spent += amount;

		stats.revenue +=
			Math.floor(
				amount * 0.70
			);

		stats.donations++;

	}

	else if (
		payload.type ===
		"Single"
	) {

		const price =
			Number(payload.price) || 0;

		const percent =
			payload.creatorId === MY_CREATOR_ID
				? 0.70
				: 0.40;

		stats.spent += price;

		stats.revenue +=
			Math.floor(
				price * percent
			);

		stats.single++;

	}

	else if (
		payload.type ===
		"Bulk"
	) {

		let spent = 0;
		let revenue = 0;

		for (
			const item of payload.items
		) {

			const price =
				Number(item.price) || 0;

			spent += price;

			revenue +=
				Math.floor(
					price *
					(
						item.creatorId === MY_CREATOR_ID
							? 0.70
							: 0.40
					)
				);

		}

		stats.spent += spent;
		stats.revenue += revenue;

		stats.bulk++;

	}

	await env.WEEKLY_STATS.put(
		weekKey,
		JSON.stringify(stats)
	);

}

export default {

async fetch(request, env) {

	if (request.method !== "POST") {

		return new Response(
			"Method Not Allowed",
			{
				status: 405
			}
		);

	}

	try {

		const url =
			new URL(request.url);

		const data =
			await request.json();

		const isDonation =
			url.pathname === "/";

		const isSingle =
			url.pathname === "/item";

		const isBulk =
			url.pathname === "/bulk";

  	    const isStats =
	   	    url.pathname === "/stats";

		if (
			isDonation &&
			data.secret !== env.DONATION_SECRET
		) {

			return new Response(
				"Unauthorized",
				{
					status: 401
				}
			);

		}

		if (
			(isSingle || isBulk) &&
			data.secret !== env.ITEMS_SECRET
		) {

			return new Response(
				"Unauthorized",
				{
					status: 401
				}
			);

		}

    if (
	    isStats &&
	    data.secret !== env.STATS_SECRET
    ) {

	return new Response(
		"Unauthorized",
		{
			status: 401
		}
	);

}

		let avatarUrl = null;

    if (isStats) {

	await updateWeeklyStats(
		env,
		data
	);

	return Response.json({
		success: true
	});

}

		if (
			data.userId &&
			!isMonthly
		) {

			try {

				const thumbnailResponse =
					await fetch(
						`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${data.userId}&size=420x420&format=Png&isCircular=false`
					);

				const thumbnailData =
					await thumbnailResponse.json();

				avatarUrl =
					thumbnailData.data?.[0]?.imageUrl;

			}
			catch {

			}

		}

		let discordPayload;
		let webhookUrl;

		if (isDonation) {

			let color = 0x57F287;

			const revenue =
				Math.floor(
					Number(data.amount) * 0.70
				);

			discordPayload = {

				embeds: [

					{

						title:
							data.isStudio
							? "<a:ping:1398387011366158356> Donación Simulada"
							: "<a:Giveaway:1398387060624199750> Nueva Donación Verificada <:Verificado:1441221673540911196>",

						description:
							`**${data.displayName}** realizó una donación. <:miau:1407114825791705210>`,

						color,

						author: {

							name: `Comprador: ${data.displayName} (@${data.username})`,
							icon_url: avatarUrl

						},

						thumbnail: {
							url: avatarUrl
						},

						fields: [

							{
								name:
									"<:Member:1421793084349485116> Display Name",
								value:
									String(data.displayName),
								inline:
									true
							},

							{
								name:
									"<:Member:1421793084349485116> Username",
								value:
									String(data.username),
								inline:
									true
							},

							{
								name:
									"<:headstaff:1421793573640212572> UserId",
								value:
									String(data.userId),
								inline:
									true
							},

							{
								name:
									"Donación",
								value:
									`${Number(data.amount).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
								inline:
									false
							},

							{
								name:
									"Ganancia 👻",
								value:
									`${revenue.toLocaleString()} <:RobuxIcon:1513312643073573028> [ 70% ]`,
								inline:
									false
							}

						],

						footer: {

							text:
								data.isStudio
								? "Studio Simulation"
								: "Donation Alert"

						},

						timestamp:
							new Date()
							.toISOString()

					}

				]

			};

			webhookUrl =
				env.DONATION_WEBHOOK;

		}

		else if (isSingle) {

			const item =
				data.item;

			discordPayload = {

				embeds: [

					{

						title:
							data.isStudio
							? "<a:ping:1398387011366158356> Compra Individual Simulada"
							: "Compra Individual Verificada <:Verificado:1441221673540911196>",

						color:
							0x5865F2,

						author: {

							name:
								`Comprador: ${data.displayName} (@${data.username})`,

							icon_url:
								avatarUrl

						},

						thumbnail: {
							url: item.image
						},

						fields: [

							{
								name:
									"<a:FakeNitroEmoji:1397199158393180250> Item",
								value:
									item.name,
								inline:
									true
							},

							{
								name:
									"💳 Precio",
								value:
									`${Number(item.price).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
								inline:
									true
							},

							{
								name:
									"💰 Ganancia",
								value:
									`${Number(item.revenue || 0).toLocaleString()} <:RobuxIcon:1513312643073573028> [ ${Math.floor((item.percent || 0) * 100)}% ]`,
								inline:
									true
							},

							{
								name:
									"<:headstaff:1421793573640212572> AssetId",
								value:
									String(
										item.id
									),
								inline:
									true
							}

						],

						timestamp:
							new Date().toISOString()

					}

				]

			};

			webhookUrl =
				env.SINGLE_ITEM_WEBHOOK;

		}

		else if (isBulk) {

			const itemsText =
				data.items
				.slice(0, 25)
				.map(
					item =>
						`<a:emoji_81:1427445383625183377> **${item.name}** ( ${item.price} <:RobuxIcon:1513312643073573028> | Ganancia: ${item.revenue || 0} )`
				)
				.join("\n");

			discordPayload = {

				embeds: [

					{

						title:
							data.isStudio
							? "<a:ping:1398387011366158356> Compra Bulk Simulada"
							: "Compra Bulk Verificada <:Verificado:1441221673540911196>",

						color:
							0xFEE75C,

						author: {

							name:
								`Comprador: ${data.displayName} (@${data.username})`,

							icon_url:
								avatarUrl

						},

						fields: [

							{
								name:
									"🛒 Cantidad de Items",
								value:
									String(
										data.itemCount
									),
								inline:
									true
							},

							{
								name:
									"<:RobuxIcon:1513312643073573028> Total Gastado",
								value:
									`${Number(data.totalRobux).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
								inline:
									true
							},

							{
								name:
									"💰 Ganancia Total",
								value:
									`${Number(data.totalRevenue || 0).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
								inline:
									true
							},

							{
								name:
									"Items Comprados",
								value:
									itemsText ||
									"Sin items"
							}

						],

						timestamp:
							new Date()
							.toISOString()

					}

				]

			};

			webhookUrl =
				env.BULK_ITEMS_WEBHOOK;

		}

		else {

			return new Response(
				"Invalid Route",
				{
					status: 404
				}
			);

		}

		const discordResponse =
			await fetch(
				webhookUrl,
				{

					method: "POST",

					headers: {
						"Content-Type":
							"application/json"
					},

					body:
						JSON.stringify(
							discordPayload
						)

				}
			);

		if (!discordResponse.ok) {

			const text =
				await discordResponse.text();

			return new Response(
				text,
				{
					status: 500
				}
			);

		}

		return new Response(
			JSON.stringify({
				success: true
			}),
			{

				headers: {
					"Content-Type":
						"application/json"
				}

			}
		);

	}
	catch (err) {

		return new Response(
			JSON.stringify({

				success: false,

				error:
					err.toString()

			}),
			{

				status: 500,

				headers: {

					"Content-Type":
						"application/json"

				}

			}
		);

	}

},

async scheduled(event, env, ctx) {

    const weekKey =
        getPreviousWeekKey();

    const raw =
        await env.WEEKLY_STATS.get(
            weekKey
        );

    if (!raw) {
        return;
    }

    const data =
        JSON.parse(raw);

    const discordPayload = {

        embeds: [

            {

                title:
                    "<:headdeveloper:1421793561187319848> Resumen Semanal de Ganancias",

                color: 0x2ECC71,

                fields: [

                    {
                        name: "📅 Semana",
                        value: data.week,
                        inline: true
                    },

                    {
                        name: "💸 Total Gastado",
                        value:
                            `${Number(data.spent).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
                        inline: true
                    },

                    {
                        name: "<:BulkPurchase:1513431101257810000> Total Generado",
                        value:
                            `${Number(data.revenue).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
                        inline: true
                    },

                    {
                        name: "<:IndvidualItem:1513431023395016785> Compras Individuales",
                        value: String(data.single),
                        inline: true
                    },

                    {
                        name: "<:ShopCart:1513431174977163274> Compras Bulk",
                        value: String(data.bulk),
                        inline: true
                    },

                    {
                        name: "<:Gift:1497093325176442991> Donaciones",
                        value: String(data.donations),
                        inline: true
                    }

                ],

                footer: {
                    text: "Weekly Revenue Report"
                },

                timestamp:
                    new Date().toISOString()

            }

        ]

    };

    await fetch(
        env.STATS_WEBHOOK,
        {

            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body:
                JSON.stringify(
                    discordPayload
                )

        }
    );

}

};
