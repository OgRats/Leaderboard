const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Extrayendo holders reales en vivo desde la blockchain de Ronin...");
        
        let snapshotActual = {};
        let errorEnRed = false;

        // Intentamos usar el indexador público descentralizado alternativo para Ronin
        try {
            const urlNFT = `https://api.roninchain.com/nft/v2/contracts/${contratoOgRats}/owners?limit=100`;
            const response = await fetch(urlNFT, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });

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
            } else {
                errorEnRed = true;
            }
        } catch (e) {
            errorEnRed = true;
        }

        // Si los nodos globales fallan o dan 404, usamos el extractor RPC por lotes agregados
        if (errorEnRed || Object.keys(snapshotActual).length === 0) {
            console.log("⏳ Aplicando extractor RPC alternativo optimizado por bloques...");
            const urlRPC = "https://api.roninchain.com/rpc";
            
            const dataRPC = {
                jsonrpc: "2.0",
                id: 1,
                method: "eth_getLogs",
                params: [{
                    address: contratoOgRats,
                    fromBlock: "latest", // Captura la actividad más reciente del contrato
                    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]
                }]
            };

            const responseRPC = await fetch(urlRPC, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataRPC)
            });

            if (responseRPC.ok) {
                const jsonRPC = await responseRPC.json();
                const logs = jsonRPC.result || [];
                
                logs.forEach(log => {
                    if (log.topics && log.topics[2]) {
                        const walletDestino = "0x" + log.topics[2].slice(26).toLowerCase();
                        if (walletDestino !== "0x0000000000000000000000000000000000000000") {
                            snapshotActual[walletDestino] = (snapshotActual[walletDestino] || 0) + 1;
                        }
                    }
                });
            }
        }

        const totalHolders = Object.keys(snapshotActual).length;
        if (totalHolders === 0) {
            throw new Error("No se pudieron recuperar datos automáticos de la red Ronin en este ciclo.");
        }

        console.log(`📊 Sincronizados automáticamente ${totalHolders} holders activos de la colección.`);

        console.log("⏳ Consultando historial de puntuación en Supabase...");
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

        console.log(`⏳ Subiendo cambios a la base de datos de Supabase...`);
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

        if (!resInsert.ok) throw new Error("Error en la pasarela de Supabase.");

        console.log("✅ ¡Sincronización masiva completada con éxito!");

    } catch (error) {
        console.error("❌ Detener:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
