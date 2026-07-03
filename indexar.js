const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_KEY_RONIN = process.env.RONIN_API_KEY;
const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Conectando con el Marketplace de Ronin...");
        const urlAPI = `https://api-gateway.skymavis.com/skynet/ronin/web3/v2/collections/${contratoOgRats}/tokens?limit=200`;
        const responseRonin = await fetch(urlAPI, {
            method: "GET",
            headers: { 
                "Accept": "application/json", 
                "X-API-KEY": API_KEY_RONIN 
            }
        });

        const json = await responseRonin.json();
        
        // ESTO NOS MOSTRARÁ EN LA CAPTURA EL MENSAJE EXACTO DE ERROR DE RONIN
        console.log("🔍 RESPUESTA CRUDA DE RONIN:", JSON.stringify(json));

        if (!responseRonin.ok) {
            throw new Error(`Ronin respondió con estado ${responseRonin.status}`);
        }
        
        let tokens = [];
        if (json && Array.isArray(json.result)) {
            tokens = json.result;
        } else if (json && json.result && Array.isArray(json.result.items)) {
            tokens = json.result.items;
        } else if (json && Array.isArray(json.items)) {
            tokens = json.items;
        }

        if (!Array.isArray(tokens) || tokens.length === 0) {
            throw new Error("No se pudo obtener una lista válida de tokens.");
        }

        const mapaBalances = {};
        tokens.forEach(token => {
            const owner = token.owner || token.minterAddress || "";
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

        console.log(`⏳ Limpiando datos viejos y subiendo ${filasAInsertar.length} holders a Supabase vía API Rest...`);
        
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

        console.log("✅ ¡Supabase se ha actualizado correctamente!");

    } catch (error) {
        console.error("❌ Ocurrió un error en la sincronización:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
