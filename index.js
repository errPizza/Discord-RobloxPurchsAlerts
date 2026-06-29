const MY_CREATOR_ID = 802409113;

function getWeekKey(date = new Date()) {

    const start = new Date(
        Date.UTC(
            date.getUTCFullYear(),
            0,
            1
        )
    );

    const day = Math.floor(
        (date - start) / 86400000
    );

    const week = Math.ceil(
        (day + start.getUTCDay() + 1) / 7
    );

    return `${date.getUTCFullYear()}-W${week}`;

}

function normalizePrice(price, isPlusPlayer) {

    price = Number(price) || 0;

    if (isPlusPlayer && price >= 10) {
        return Math.round(price / 0.90);
    }

    return price;

}

async function updateWeeklyStats(env,payload) {

	const weekKey = getWeekKey();

	const raw = await env.WEEKLY_STATS.get(
		weekKey
	);

	let stats;

	try {

		stats = raw ? JSON.parse(raw) : null;

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

	if (payload.type === "Donation") {

		const amount = Number(payload.amount) || 0;

		stats.spent += amount;

		stats.revenue +=Math.floor(
			amount * 0.70
		);

		stats.donations++;

	}

	else if (payload.type === "Single") {

		const price = normalizePrice(
   		    payload.price,
   		    payload.isPlusPlayer
		);

		const percent =payload.creatorId === MY_CREATOR_ID ? 0.70 : 0.40;

		stats.spent += price;

		stats.revenue +=Math.floor(
			price * percent
		);

		stats.single++;

	}

	else if (payload.type === "Bulk") {

		let spent = 0;
		let revenue = 0;

		for (const item of payload.items) {

			const price = normalizePrice(
   		        payload.price,
   		        payload.isPlusPlayer
		    );

			spent += price;

			revenue +=Math.floor(price *
				(
					item.creatorId === MY_CREATOR_ID ? 0.70 : 0.40
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

	const weekKey = getWeekKey();

	let donationNumber = 1;
	let singleNumber   = 1;
	let bulkNumber     = 1;

	try {

		const rawStats = await env.WEEKLY_STATS.get(
			weekKey
		);

		if (rawStats) {

			const stats = JSON.parse(rawStats);

			donationNumber = (stats.donations || 0) + 1;
			singleNumber   = (stats.single || 0) + 1;
			bulkNumber     = (stats.bulk || 0) + 1;

		}

	}

	catch (err) {

		console.error(
			"[DONATION COUNT]",
			err
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

	if (data.userId &&!isStats) {

	try {

		const thumbnailResponse =await fetch(
			`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${data.userId}&size=420x420&format=Png&isCircular=false`
		);

		if (thumbnailResponse.ok) {

			const thumbnailData = await thumbnailResponse.json();

			avatarUrl = thumbnailData.data?.[0]?.imageUrl ?? null;

		}

	}

	catch (err) {

		console.error(
			"[THUMBNAIL]",
			err
		);

	}

	}

    if (isStats) {

	await updateWeeklyStats(
		env,
		data
	);

	return Response.json({
		success: true
	});

	}

	let discordPayload;
	let webhookUrl;

	if (isDonation) {

		let color = 0x57F287;

		const revenue = Math.floor(
			Number(data.amount) * 0.70
		);

	    discordPayload = {

		content: `# ¡Nueva Donación Recibida!\nSe ha detectado una nueva donación en **🛍 Lacywings Outfits!**\n-# Eso eso >:). Sigan donando.\n`,

		embeds: [

			{

				title: data.isStudio ? "<a:ping:1398387011366158356> Donación Simulada" : "Compra Individual Verificada <:Verificado:1441221673540911196>",

				description: `Información del Player:`,

				color: 0x99FF00,

				author: {

					name: `${data.displayName} (@${data.username})`,

					icon_url: avatarUrl

				},

				thumbnail: {

					url: "https://cdn.discordapp.com/attachments/1416335365719199794/1515193160609828985/IMG_6139.jpg?ex=6a2e1d18&is=6a2ccb98&hm=b397336afb96af07eb37e1dd0b5f97e7e4c0c93e1339d80904b6c52179be82b6&"

				},

				image: {

					url: "https://cdn.discordapp.com/attachments/1446777790740430858/1513638110758572102/IMG_6138.jpg?ex=6a2dbad7&is=6a2c6957&hm=ac472fb181a1a329394c87b85cd4b12cdc28b251989f25bb539b9d52caf5c79b&"

				},

				fields: [

					{

						name: "<:Member:1421793084349485116> Display Name",

						value: String(
							data.displayName
						),

						inline: true

					},

					{

						name: "<:Member:1421793084349485116> Username",

						value: String(
							data.username
						),

						inline: true

					},

					{

						name: "<:headstaff:1421793573640212572> UserId",

						value:String(
							data.userId
						),
	
						inline: true

					},

					{

						name: "<:gifter:1438158241908396203> Donación",

						value: `${Number(data.amount).toLocaleString()} <:RobuxIcon:1513312643073573028>`,

						inline: true

					},

					{

						name: "👻 Ganancia",

						value: `${revenue.toLocaleString()} <:RobuxIcon:1513312643073573028>`,

						inline:	true

					}

				],

				footer: {

					text: `Esta es la donación número ${donationNumber} de esta semana :D`

				},

				timestamp: new Date().toISOString()

			}

		]
		
    };

		webhookUrl =env.DONATION_WEBHOOK;

	}

		else if (isSingle) {

			const item = data.item;

			let itemImage = null;

			try {

				let thumbnailUrl;

				if (item.AssetType === "Bundle") {
			
					thumbnailUrl = `https://thumbnails.roblox.com/v1/bundles/thumbnails?bundleIds=${item.id}&size=420x420&format=Png&isCircular=false`;
			
				} else {

					thumbnailUrl = `https://thumbnails.roblox.com/v1/assets-thumbnail?assetIds=${item.id}&size=420x420&format=Png&isCircular=false`;

				}

				const thumbnailResponse = await fetch(thumbnailUrl);

				if (thumbnailResponse.ok) {

					const thumbnailData = await thumbnailResponse.json();

					itemImage = thumbnailData.data?.[0]?.imageUrl ?? null;

				}

			}

			catch (err) {

				console.error("[ITEM THUMBNAIL]", err);

			}

			discordPayload = {

				content: `# ¡Nueva Compra Recibida!\nSe ha detectado una nueva compra en **🛍 Lacywings Outfits!**\n-# Eso eso >:). Sigan comprando.\n`,

				embeds: [

					{
                        
						title:data.isStudio ? "<a:ping:1398387011366158356> Compra Individual Simulada" : "Compra Individual Verificada <:Verificado:1441221673540911196>",

						color: 0x00ffcc,
                        
						author: {

							name: `Comprador: ${data.displayName} (@${data.username})`,

							icon_url: avatarUrl

						},

                        description: "Información de la compra:",

						thumbnail: {
	                        url: itemImage
                        },

						image: {
	                        url: "https://cdn.discordapp.com/attachments/1446777790740430858/1513638110758572102/IMG_6138.jpg?ex=6a42d2d7&is=6a418157&hm=6803c02a386bb95b911805ce9fb9fe0bf4ee19b7ff912630684c5d0c85f40a3a&"
                        },

						fields: [

                           	{
                   	        	name: "<a:FakeNitroEmoji:1397199158393180250> Item",
	                           	value: item.name,
	                           	inline: true
                           	},

                           	{
	                           	name: "<:headstaff:1421793573640212572> AssetId",
	                           	value: String(item.id),
	                           	inline: true
                           	},

                           	{
                           		name: "💳 Precio",
                           		value: `${Number(item.price).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
                           		inline: true
                           	},

                           	{
	                           	name: "💰 Ganancia",
	                           	value: `${Number(item.revenue || 0).toLocaleString()} <:RobuxIcon:1513312643073573028> [ ${Math.floor((item.percent || 0) * 100)}% ]`,
	                           	inline: true
                           	}

                        ],

						footer: {text: `Esta es la compra número ${singleNumber} de esta semana :D`},
						timestamp: new Date().toISOString()

					}

				]

			};

			webhookUrl = env.SINGLE_ITEM_WEBHOOK;

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

						title:data.isStudio ? "<a:ping:1398387011366158356> Compra Bulk Simulada" : "Compra Bulk Verificada <:Verificado:1441221673540911196>",

						color: 0xFEE75C,

                        description: "Información de la compra Bulk:",

						author: {

							name: `Comprador: ${data.displayName} (@${data.username})`,

							icon_url: avatarUrl

						},

						thumbnail: {
   						    url: "https://cdn.discordapp.com/attachments/1416335365719199794/1515193160609828985/IMG_6139.jpg?ex=6a428c58&is=6a413ad8&hm=63963e17060cc45239269457c57326a947f327f3d645badf03d02044b8ca1976&"
						},

						image: {
    						url: "https://cdn.discordapp.com/attachments/1446777790740430858/1513638110758572102/IMG_6138.jpg?ex=6a42d2d7&is=6a418157&hm=6803c02a386bb95b911805ce9fb9fe0bf4ee19b7ff912630684c5d0c85f40a3a&"
						},

						fields: [

    					{
    						name: "🛒 Cantidad de Items",
    						value: String(data.itemCount),
    						inline: true
   						},

   						{
    						name: "<:RobuxIcon:1513312643073573028> Total Gastado",
    						value: `${Number(data.totalRobux).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
    						inline: true
  						},

   						{
    						name: "💰 Ganancia Total",
     						value: `${Number(data.totalRevenue).toLocaleString()} <:RobuxIcon:1513312643073573028>`,
     						inline: true
   						},

   						{
     						name: "Items Comprados",
      						value: itemsText || "Sin items"
   						}

						],

						footer: {text: `Esta es la compra número ${bulkNumber} de esta semana :D`},
						timestamp: new Date().toISOString()

					}

				]

			};

			webhookUrl = env.BULK_ITEMS_WEBHOOK;

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

				error: err.toString()

			}),

			{

				status: 500,

				headers: {

					"Content-Type": "application/json"

				}

			}
		);

	}

},

async scheduled(event, env, ctx) {

    const lastWeek = new Date();
    lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);

    const weekKey = getWeekKey(lastWeek);

    const raw = await env.WEEKLY_STATS.get(
         weekKey
    );

    if (!raw) {
        return;
    }

    const data = JSON.parse(raw);

    const discordPayload = {

        embeds: [

            {

                title: "<:headdeveloper:1421793561187319848> Resumen Semanal de Ganancias",

                color: 0xffff00,

				thumbnail: {
   					url: "https://cdn.discordapp.com/attachments/1416335365719199794/1515193160609828985/IMG_6139.jpg?ex=6a428c58&is=6a413ad8&hm=63963e17060cc45239269457c57326a947f327f3d645badf03d02044b8ca1976&"
				},

			    image: {
    				url: "https://cdn.discordapp.com/attachments/1446777790740430858/1513638110758572102/IMG_6138.jpg?ex=6a42d2d7&is=6a418157&hm=6803c02a386bb95b911805ce9fb9fe0bf4ee19b7ff912630684c5d0c85f40a3a&"
				},

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

                footer: {text: "Informe de ingresos semanales"},
                timestamp: new Date().toISOString()

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