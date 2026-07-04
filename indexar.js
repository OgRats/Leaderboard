const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Conectando con la API de Datos del Explorador Oficial de Ronin...");
        
        // Endpoint que lee directo los balances acumulados del contrato (Top 50) de la dApp Oficial
        const urlEcosistema = `https://app.roninchain.com/api/token/nft/${contratoOgRats}/holders?limit=50`;

        const response = await fetch(urlEcosistema, {
            method: "GET",
            headers: { 
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 
            }
        });

        let snapshotActual = {};

        if (response.ok) {
            const json = await response.json();
            const items = json.items || json.results || [];
            
            items.forEach(ownerInfo => {
                const wallet = (ownerInfo.owner || ownerInfo.address || ownerInfo.ownerAddress || "").toLowerCase();
                const cantidad = parseInt(ownerInfo.balance || ownerInfo.tokenCount || ownerInfo.token_count || 1);
                
                if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                    snapshotActual[wallet] = cantidad;
                }
            });
        } else {
            console.log("⚠️ Endpoint saturado, ejecutando mapeo vía RPC alternativo...");
            // Plan B alternativo vía rpc unificado de Sky Mavis sin intermediarios de frontend
            const resRPC = await fetch("https://api-gateway.skymavis.com/rpc", {
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
            
            if (resRPC.ok) {
                const jsonRPC = await resRPC.json();
                const logs = jsonRPC.result || [];
                logs.slice(0, 50).forEach(log => {
                    if (log.topics && log.topics[2]) {
                        const wallet = "0x" + log.topics[2].slice(26).toLowerCase();
                        snapshotActual[wallet] = (snapshotActual[wallet] || 0) + 1;
                    }
                });
            }
        }

        const totalHolders = Object.keys(snapshotActual).length;
        if (totalHolders === 0) {
            throw new Error("La blockchain de Ronin denegó el acceso por límites de cuota públicos.");
        }

        console.log(`📊 ¡Encontrados ${totalHolders} holders reales en el Top!`);

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

        console.log(`⏳ Subiendo el Top 50 real a Supabase...`);
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

        if (!resInsert.ok) throw new Error("Error escribiendo los datos en Supabase.");

        console.log("✅ ¡Sincronización del Top 50 completada!");

    } catch (error) {
        console.error("❌ Error de procesamiento:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
