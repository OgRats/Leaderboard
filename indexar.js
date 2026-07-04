const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Consultando los Top Holders en OpenSea...");
        
        // Endpoint oficial de OpenSea para traer la clasificación de dueños de la colección
        const urlAPI = `https://api.opensea.io/api/v2/chain/ronin/contract/${contratoOgRats}/owners?limit=50`;
        
        const responseOS = await fetch(urlAPI, { 
            method: "GET", 
            headers: { 
                "Accept": "application/json", 
                "X-API-KEY": OPENSEA_API_KEY 
            } 
        });

        if (!responseOS.ok) {
            throw new Error(`OpenSea respondió con estado ${responseOS.status}. Verifica tu API Key.`);
        }

        const json = await responseOS.json();
        const owners = json.owners || [];

        if (owners.length === 0) {
            throw new Error("OpenSea no devolvió ningún holder para esta colección.");
        }

        // 1. Mapear los balances actuales del Top de OpenSea
        const snapshotActual = {};
        owners.forEach(ownerInfo => {
            const wallet = (ownerInfo.owner || "").toLowerCase();
            const cantidad = parseInt(ownerInfo.balance || 1);
            if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                snapshotActual[wallet] = cantidad;
            }
        });

        console.log(`📊 Encontrados ${Object.keys(snapshotActual).length} holders en el Top de OpenSea.`);

        // 2. Traer los puntos acumulados históricos de Supabase
        console.log("⏳ Leyendo historial de puntos en Supabase...");
        const resPrevia = await fetch(`${SUPABASE_URL}/rest/v1/ograts_holders?select=address,puntos`, {
            method: "GET",
            headers: { "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        });

        const datosViejos = resPrevia.ok ? await resPrevia.json() : [];
        const historialPuntos = {};
        datosViejos.forEach(row => {
            if (row.address) historialPuntos[row.address.toLowerCase()] = row.puntos || 0;
        });

        // 3. Procesar las filas finales sumando el balance del día a los puntos acumulados
        const filasAInsertar = Object.keys(snapshotActual).map(wallet => {
            const nftsHoy = snapshotActual[wallet];
            const puntosViejos = historialPuntos[wallet] || 0;
            return {
                address: wallet,
                balance: nftsHoy,
                puntos: puntosViejos + nftsHoy,
                updated_at: new Date().toISOString()
            };
        });

        console.log(`⏳ Actualizando la base de datos de Supabase...`);
        
        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/ograts_holders`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify(filasAInsertar)
        });

        if (!resInsert.ok) throw new Error("Error al guardar registros en Supabase.");

        console.log("✅ ¡Sincronización del Top 50 completada con éxito!");

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
