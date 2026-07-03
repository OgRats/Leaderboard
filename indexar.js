const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_KEY_RONIN = process.env.RONIN_API_KEY;
const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function actualizarLeaderboard() {
    try {
        console.log("⏳ Conectando con el Marketplace de Ronin...");
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        const urlAPI = `https://api-gateway.skymavis.com/skynet/ronin/web3/v2/collections/${contratoOgRats}/tokens?limit=200`;
        const response = await fetch(urlAPI, {
            method: "GET",
            headers: { 
                "Accept": "application/json", 
                "X-API-KEY": API_KEY_RONIN 
            }
        });

        if (!response.ok) throw new Error(`Error en la API de Ronin: ${response.status}`);
        
        const json = await response.json();
        
        // Ajuste aquí: Extraemos la lista de tokens sin importar cómo venga estructurada
        let tokens = [];
        if (json && Array.isArray(json.result)) {
            tokens = json.result;
        } else if (json && json.result && Array.isArray(json.result.items)) {
            tokens = json.result.items;
        } else if (json && Array.isArray(json.items)) {
            tokens = json.items;
        } else if (Array.isArray(json)) {
            tokens = json;
        }

        if (!Array.isArray(tokens) || tokens.length === 0) {
            console.log("⚠️ Respuesta de la API recibida:", JSON.stringify(json));
            throw new Error("No se pudo obtener una lista válida de tokens. Revisa el formato o tu API Key.");
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

        console.log(`⏳ Limpiando datos viejos y subiendo ${filasAInsertar.length} holders a Supabase...`);
        await supabase.from('ograts_holders').delete().neq('address', '0x0');
        const { error } = await supabase.from('ograts_holders').insert(filasAInsertar);

        if (error) throw error;
        console.log("✅ ¡Supabase se ha actualizado correctamente!");

    } catch (error) {
        console.error("❌ Ocurrió un error en la sincronización:", error);
        process.exit(1);
    }
}

actualizarLeaderboard();
        
