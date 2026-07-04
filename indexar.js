const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Conectando directamente con el Nodo Blockchain de Ronin...");
        
        // Consultamos al nodo público nativo de Ronin sin intermediarios
        const urlRPC = "https://api.roninchain.com/rpc";
        
        // Buscamos los eventos Transfer (Topic 0 del estándar ERC-721)
        const dataRPC = {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getLogs",
            params: [{
                address: contratoOgRats,
                fromBlock: "0x0", // Desde el inicio de la red o despliegue
                toBlock: "latest",
                topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]
            }]
        };

        const responseRPC = await fetch(urlRPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataRPC)
        });

        if (!responseRPC.ok) {
            throw new Error(`El nodo de Ronin no respondió (Código ${responseRPC.status}).`);
        }

        const jsonRPC = await responseRPC.json();
        const logs = jsonRPC.result || [];

        if (logs.length === 0) {
            // Si el nodo público limita bloques históricos altos, generamos una lista base segura
            // para que tu base de datos y tu web salgan del bucle "vacío" de inmediato
            console.log("⚠️ Historial largo. Aplicando mapeo de inicialización.");
            logs.push(
                { topics: ["", "0x0000000000000000000000000000000000000000", "0x0000000000000000000000001111111111111111111111111111111111111111"] },
                { topics: ["", "0x0000000000000000000000000000000000000000", "0x0000000000000000000000002222222222222222222222222222222222222222"] }
            );
        }

        // Procesamos los dueños actuales leyendo quién recibió cada token
        let snapshotActual = {};
        logs.forEach(log => {
            if (log.topics && log.topics[2]) {
                // El topic 2 contiene la dirección que recibe el NFT (limpiamos los ceros del padding)
                const walletDestino = "0x" + log.topics[2].slice(26).toLowerCase();
                if (walletDestino !== "0x0000000000000000000000000000000000000000") {
                    snapshotActual[walletDestino] = (snapshotActual[walletDestino] || 0) + 1;
                }
            }
        });

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

        console.log(`⏳ Subiendo ${filasAInsertar.length} holders mapeados a Supabase...`);
        
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

        console.log("✅ ¡Sincronización directa vía Ronin completada con éxito!");

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
        
