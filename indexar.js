const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";
const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        // 1. Conexión limpia y directa a OpenSea (Red Ronin)
        console.log("⏳ Conectando directamente con la API de OpenSea...");
        
        const urlAPI = `https://api.opensea.io/api/v2/chain/ronin/contract/${contratoOgRats}/nfts?limit=100`;
        
        const headers = { 
            "Accept": "application/json",
            "X-API-KEY": OPENSEA_API_KEY
        };

        const responseOS = await fetch(urlAPI, { method: "GET", headers: headers });

        if (!responseOS.ok) {
            const errorTexto = await responseOS.text();
            console.log("🔍 RESPUESTA DETALLADA DE OPENSEA:", errorTexto);
            throw new Error(`OpenSea respondió con estado ${responseOS.status}`);
        }

        const json = await responseOS.json();
        const nfts = json.nfts || [];

        if (nfts.length === 0) {
            throw new Error("No se encontraron NFTs en la respuesta de OpenSea.");
        }

        const mapaBalances = {};
        nfts.forEach(nft => {
            const owner = nft.owner || "";
            if (owner && owner !== "0x0000000000000000000000000000000000000000") {
                const wallet = owner.toLowerCase();
                mapaBalances[wallet] = (mapaBalances[wallet] || 0) + 1;
            }
        });

        const filasAInsertar = Object.keys(mapaBalances).map(wallet => ({
            address: wallet,
            balance: mapaBalances[wallet],
            updated_at: new Date().toISOString()
        }));

        // 2. Sincronizar los datos limpios en Supabase
        console.log(`⏳ Subiendo ${filasAInsertar.length} holders mapeados desde OpenSea a Supabase...`);
        
        await fetch(`${SUPABASE_URL}/rest/v1/ograts_holders?address=not.eq.0x0`, {
            method: "DELETE",
            headers: {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
        });

        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/ograts_holders`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            body: JSON.stringify(filasAInsertar)
        });

        if (!resInsert.ok) {
            throw new Error(`Error insertando en Supabase: ${resInsert.status}`);
        }

        console.log("✅ ¡Sincronización vía OpenSea completada con éxito!");

    } catch (error) {
        console.error("❌ Ocurrió un error en la sincronización:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
