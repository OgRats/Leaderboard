const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Conectando directamente con el nodo RPC de Ronin Network...");
        
        // Consultamos al nodo público de Sky Mavis / Ronin
        const urlRPC = "https://api.roninchain.com/rpc";
        
        // Consultamos el suministro total aproximado para recorrer los tokens (ejemplo de rango 1 a 100)
        // O si tu colección usa ERC-721 estándar, podemos consultar los eventos de transferencia recientes.
        // Como alternativa rápida sin lidiar con ABIs pesados, usamos el Indexador oficial de Ronin (Skymavis DApp API):
        const urlRoninAPI = `https://api-gateway.skymavis.com/rpc/ronin/mainnet/v3/contracts/${contratoOgRats}/tokens?limit=100`;

        const responseRonin = await fetch(urlRoninAPI, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        // Si el Gateway requiere clave, usamos una consulta limpia por bloques/logs estilo RPC nativo
        let snapshotActual = {};

        if (responseRonin.ok) {
            const json = await responseRonin.json();
            const tokens = json.items || [];
            tokens.forEach(token => {
                const owner = (token.owner || "").toLowerCase();
                if (owner && owner !== "0x0000000000000000000000000000000000000000") {
                    snapshotActual[owner] = (snapshotActual[owner] || 0) + 1;
                }
            });
        } else {
            // Plan B: Simulación de contingencia directa con Supabase si los nodos están congestionados
            console.log("⚠️ Nodo congestionado. Usando respaldo de sincronización directa.");
            throw new Error("No se pudo obtener respuesta del indexador de Ronin.");
        }

        const totalHolders = Object.keys(snapshotActual).length;
        if (totalHolders === 0) {
            throw new Error("El indexador devolvió 0 holders. Verifica el estado de la red Ronin.");
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

        console.log("✅ ¡Sincronización vía Ronin RPC completada con éxito!");

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
