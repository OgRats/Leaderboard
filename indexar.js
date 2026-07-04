const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";

// El slug extraído de tu URL: https://opensea.io/collection/ograts/holders
const coleccionSlug = "ograts"; 

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log(`⏳ Extrayendo los Top Holders de la colección "${coleccionSlug}" directo de OpenSea...`);
        
        // Endpoint oficial optimizado para traer el ranking de dueños (máximo de 50 para el top)
        const urlAPI = `https://api.opensea.io/api/v2/collections/${coleccionSlug}/owners?limit=50`;
        
        const responseOS = await fetch(urlAPI, { 
            method: "GET", 
            headers: { 
                "Accept": "application/json", 
                "X-API-KEY": OPENSEA_API_KEY,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            } 
        });

        if (!responseOS.ok) {
            throw new Error(`OpenSea respondió con estado ${responseOS.status}. Comprueba que tu API Key esté bien configurada en los Secretos.`);
        }

        const json = await responseOS.json();
        
        // OpenSea formatea la respuesta como un array 'owners'
        const ownersList = json.owners || json.results || [];

        if (ownersList.length === 0) {
            throw new Error("La respuesta de OpenSea vino vacía o la estructura cambió.");
        }

        // 1. Mapeamos las wallets y sus respectivos balances del top
        const snapshotActual = {};
        ownersList.forEach(ownerInfo => {
            // Soportamos múltiples variaciones del JSON de OpenSea para mayor resistencia
            const wallet = (ownerInfo.owner || ownerInfo.address || "").toLowerCase();
            const cantidad = parseInt(ownerInfo.balance || ownerInfo.token_count || 1);
            
            if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                snapshotActual[wallet] = cantidad;
            }
        });

        console.log(`📊 Éxito: Encontrados ${Object.keys(snapshotActual).length} holders en el Top de OpenSea.`);

        // 2. Traer los puntos acumulados históricos de Supabase
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

        if (!resInsert.ok) {
            const errorTxt = await resInsert.text();
            throw new Error(`Supabase rechazó los datos: ${errorTxt}`);
        }

        console.log("✅ ¡Sincronización del Top 50 completada con éxito!");

    } catch (error) {
        console.error("❌ Error de procesamiento:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
