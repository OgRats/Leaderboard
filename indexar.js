const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";

const coleccionSlug = "ograts"; 

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log(`⏳ Extrayendo los Top Holders de la colección "${coleccionSlug}" directo de OpenSea...`);
        
        // Endpoint oficial v2 para traer la clasificación exacta de dueños (Pestaña /holders)
        const urlAPI = `https://api.opensea.io/api/v2/collections/${coleccionSlug}/owners?limit=50`;
        
        const responseOS = await fetch(urlAPI, { 
            method: "GET", 
            headers: { 
                "Accept": "application/json", 
                "X-API-KEY": OPENSEA_API_KEY
            } 
        });

        if (!responseOS.ok) {
            throw new Error(`OpenSea respondió con estado ${responseOS.status}.`);
        }

        const json = await responseOS.json();
        const ownersList = json.owners || json.results || [];

        if (ownersList.length === 0) {
            throw new Error("La respuesta de OpenSea vino vacía.");
        }

        const snapshotActual = {};
        ownersList.forEach(ownerInfo => {
            const wallet = (ownerInfo.owner || ownerInfo.address || "").toLowerCase();
            const cantidad = parseInt(ownerInfo.balance || ownerInfo.token_count || 1);
            
            if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                snapshotActual[wallet] = cantidad;
            }
        });

        console.log(`📊 Éxito: Encontrados ${Object.keys(snapshotActual).length} holders reales.`);

        console.log("⏳ Leyendo historial de puntos de Supabase...");
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

        console.log(`⏳ Subiendo datos reales a tu Supabase...`);
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

        console.log("✅ ¡Sincronización del Top 50 completada con éxito!");

    } catch (error) {
        console.error("❌ Error de procesamiento:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
