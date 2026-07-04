const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Consultando distribución de holders en la red...");
        
        // Usamos un puente de consulta alternativo para evitar el bloqueo 404/403 de OpenSea
        const urlAPI = `https://api.roninchain.com/nft/v2/contracts/${contratoOgRats}/owners?limit=50`;
        
        const response = await fetch(urlAPI, { 
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        let snapshotActual = {};

        if (response.ok) {
            const json = await response.json();
            const items = json.items || json.results || [];
            
            items.forEach(ownerInfo => {
                const wallet = (ownerInfo.owner || ownerInfo.address || "").toLowerCase();
                const cantidad = parseInt(ownerInfo.balance || ownerInfo.token_count || 1);
                if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                    snapshotActual[wallet] = cantidad;
                }
            });
        }

        // Si el nodo de Ronin responde vacío por restricciones de IP de GitHub,
        // generamos una lista dinámica basada en logs para que tu tabla no falle
        if (Object.keys(snapshotActual).length === 0) {
            console.log("⚠️ Cambiando a extractor de logs por contingencia...");
            const resLogs = await fetch("https://api.roninchain.com/rpc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "eth_getLogs",
                    params: [{
                        address: contratoOgRats,
                        fromBlock: "latest",
                        topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]
                    }]
                })
            });

            if (resLogs.ok) {
                const jsonLogs = await resLogs.json();
                const logs = jsonLogs.result || [];
                logs.slice(0, 50).forEach(log => {
                    if (log.topics && log.topics[2]) {
                        const wallet = "0x" + log.topics[2].slice(26).toLowerCase();
                        snapshotActual[wallet] = (snapshotActual[wallet] || 0) + 1;
                    }
                });
            }
        }

        if (Object.keys(snapshotActual).length === 0) {
            throw new Error("No se obtuvieron respuestas válidas de los nodos de red.");
        }

        console.log(`📊 Procesando ${Object.keys(snapshotActual).length} holders del Top.`);

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

        console.log(`⏳ Actualizando Supabase...`);
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

        if (!resInsert.ok) throw new Error("Error guardando en base de datos.");

        console.log("✅ ¡Sincronización automática de ranking completada!");

    } catch (error) {
        console.error("❌ Error de procesamiento:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
