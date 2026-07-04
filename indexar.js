const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Obteniendo holders reales desde el Indexador de Sky Mavis...");
        
        // Endpoint público oficial de Ronin que trae los balances reales del contrato sin restricciones
        const urlRonin = `https://api.roninchain.com/tokens/v2/ronin/nft/${contratoOgRats}/owners?limit=100`;

        const response = await fetch(urlRonin, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`El indexador de Ronin no respondió (Código ${response.status}).`);
        }

        const json = await response.json();
        const ownersList = json.results || json.items || [];

        let snapshotActual = {};
        
        // Mapeamos los verdaderos dueños de la blockchain
        ownersList.forEach(ownerInfo => {
            const wallet = (ownerInfo.owner || ownerInfo.address || "").toLowerCase();
            const cantidad = parseInt(ownerInfo.balance || ownerInfo.token_count || 1);
            
            if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                snapshotActual[wallet] = cantidad;
            }
        });

        // Verificación por si la estructura cambia en la API pública
        if (Object.keys(snapshotActual).length === 0) {
            throw new Error("No se pudieron extraer holders de la respuesta de la red.");
        }

        console.log("⏳ Leyendo historial de puntos en Supabase...");
        const resPrevia = await fetch(`${SUPABASE_URL}/rest/v1/ograts_holders?select=address,puntos`, {
            method: "GET",
            headers: { "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        });

        const datosViejos = resPrevia.ok ? await resPrevia.json() : [];
        const historialPuntos = {};
        datosViejos.forEach(row => {
            historialPuntos[row.address.toLowerCase()] = row.puntos || 0;
        });

        const filasAInsertar = Object.keys(snapshotActual).map(wallet => {
            const nftsHoy = snapshotActual[wallet];
            const puntosViejos = historialPuntos[wallet] || 0;
            return {
                address: wallet,
                balance: nftsHoy,
                puntos: puntosViejos + nftsHoy, // Suma puntos reales diarios
                updated_at: new Date().toISOString()
            };
        });

        console.log(`⏳ Subiendo ${filasAInsertar.length} holders REALES a Supabase...`);
        
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

        if (!resInsert.ok) throw new Error(`Error en Supabase: ${resInsert.status}`);

        console.log("✅ ¡Sincronización REAL completada con éxito!");

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
