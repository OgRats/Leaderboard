const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";
// Dirección corregida con mayúsculas oficiales (Checksum)
const contratoOgRats = "0x953E34637cC596B8195Eb7FB83305402d3B9D000";

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log("⏳ Conectando directamente con la API de OpenSea...");
        const urlAPI = `https://api.opensea.io/api/v2/chain/ronin/contract/${contratoOgRats}/nfts?limit=100`;
        
        const responseOS = await fetch(urlAPI, { 
            method: "GET", 
            headers: { 
                "Accept": "application/json", 
                "X-API-KEY": OPENSEA_API_KEY 
            } 
        });

        if (!responseOS.ok) throw new Error(`OpenSea respondió con estado ${responseOS.status}`);

        const json = await responseOS.json();
        const nfts = json.nfts || [];

        if (nfts.length === 0) throw new Error("No se encontraron NFTs devueltos por OpenSea.");

        // 1. Contar cuántos NFTs tiene cada billetera HOY
        const snapshotActual = {};
        nfts.forEach(nft => {
            const owner = (nft.owner || "").toLowerCase();
            if (owner && owner !== "0x0000000000000000000000000000000000000000") {
                snapshotActual[owner] = (snapshotActual[owner] || 0) + 1;
            }
        });

        // 2. Traer los puntos acumulados que ya existían en Supabase
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

        // 3. Calcular nuevos puntos: Puntos acumulados + Balance de hoy
        const filasAInsertar = Object.keys(snapshotActual).map(wallet => {
            const nftsHoy = snapshotActual[wallet];
            const puntosViejos = historialPuntos[wallet] || 0;
            return {
                address: wallet,
                balance: nftsHoy,
                puntos: puntosViejos + nftsHoy, // Añade 1 punto diario por cada NFT
                updated_at: new Date().toISOString()
            };
        });

        // Mantener en la lista a los que hoy tienen 0 NFTs pero conservan puntos ganados antes
        Object.keys(historialPuntos).forEach(wallet => {
            if (!snapshotActual[wallet] && historialPuntos[wallet] > 0) {
                filasAInsertar.push({
                    address: wallet,
                    balance: 0,
                    puntos: historialPuntos[wallet],
                    updated_at: new Date().toISOString()
                });
            }
        });

        console.log(`⏳ Subiendo ${filasAInsertar.length} holders mapeados a Supabase...`);
        
        // Enviamos los datos con 'resolution=merge-duplicates' (UPSERT)
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

        console.log("✅ ¡Sincronización vía OpenSea completada con éxito!");

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
