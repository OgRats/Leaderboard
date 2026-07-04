const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Conectando con el indexador de Ronin Network...");
        const urlRonin = `https://api.roninchain.com/tokens/v2/ronin/nft/${contratoOgRats}/owners?limit=100`;

        const response = await fetch(urlRonin, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`La red no respondió correctamente (Código ${response.status}).`);
        }

        const json = await response.json();
        
        // CORRECCIÓN: Buscamos la lista dentro de cualquier propiedad posible de la API de Ronin
        const ownersList = json.results || json.items || json.data || [];

        let snapshotActual = {};
        
        ownersList.forEach(ownerInfo => {
            // Evaluamos todos los formatos posibles que usa Ronin para la wallet y el balance
            const wallet = (ownerInfo.owner || ownerInfo.address || ownerInfo.owner_address || "").toLowerCase();
            const cantidad = parseInt(ownerInfo.balance || ownerInfo.token_count || ownerInfo.amount || 1);
            
            if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                snapshotActual[wallet] = cantidad;
            }
        });

        const totalEncontrados = Object.keys(snapshotActual).length;
        if (totalEncontrados === 0) {
            throw new Error("No se detectaron holders estructurados en la respuesta.");
        }

        console.log(`📊 Se encontraron ${totalEncontrados} holders reales en la blockchain.`);

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
                puntos: puntosViejos + nftsHoy,
                updated_at: new Date().toISOString()
            };
        });

        console.log(`⏳ Actualizando base de datos en Supabase con los datos reales...`);
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

        console.log("✅ ¡Sincronización de holders reales completada!");

    } catch (error) {
        console.error("❌ Error de procesamiento:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
