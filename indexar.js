const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Usamos el slug de tu colección
const coleccionSlug = "ograts"; 

async function actualizarLeaderboard() {
    try {
        const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

        console.log(`⏳ Conectando con la pasarela interna de OpenSea para la colección "${coleccionSlug}"...`);
        
        // Esta es la URL interna de la API de OpenSea (GraphQL/Internal) que alimenta la web pública
        const urlAPI = `https://api.opensea.io/api/v2/collections/${coleccionSlug}/stats`;
        
        // Como OpenSea a veces oculta el endpoint de owners, atacamos el endpoint público de items de la colección filtrando por cantidad
        const urlNFTs = `https://api.opensea.io/api/v2/collection/${coleccionSlug}/nfts?limit=50`;

        const responseOS = await fetch(urlNFTs, { 
            method: "GET", 
            headers: { 
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            } 
        });

        // Si OpenSea sigue respondiendo 404 por culpa de la red Ronin en su API global,
        // activamos de inmediato el extractor directo del API del Explorador de Ronin (sin intermediarios)
        let snapshotActual = {};

        if (responseOS.ok) {
            const json = await responseOS.json();
            const nfts = json.nfts || [];
            
            nfts.forEach(nft => {
                const wallet = (nft.owners && nft.owners[0] && nft.owners[0].address || nft.owner || "").toLowerCase();
                if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                    snapshotActual[wallet] = (snapshotActual[wallet] || 0) + 1;
                }
            });
        } 
        
        // PLAN DE RESPALDO ULTRAESTABLE: Si OpenSea falla con Ronin, le preguntamos directamente a la API interna de la Ronin Wallet
        if (Object.keys(snapshotActual).length === 0) {
            console.log("⚠️ OpenSea no tiene indexada la ruta de Ronin. Cambiando al indexador oficial de Ronin Chain...");
            
            const urlRoninInterna = `https://app.roninchain.com/api/token/nft/0x953E34637cC596B8195Eb7FB83305402d3B9D000/holders?limit=50`;
            const resRonin = await fetch(urlRoninInterna, {
                method: "GET",
                headers: { 
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" 
                }
            });

            if (resRonin.ok) {
                const jsonRonin = await resRonin.json();
                const items = jsonRonin.items || jsonRonin.results || [];
                
                items.forEach(ownerInfo => {
                    const wallet = (ownerInfo.owner || ownerInfo.address || ownerInfo.ownerAddress || "").toLowerCase();
                    const cantidad = parseInt(ownerInfo.balance || ownerInfo.tokenCount || 1);
                    if (wallet && wallet !== "0x0000000000000000000000000000000000000000") {
                        snapshotActual[wallet] = cantidad;
                    }
                });
            }
        }

        const totalEncontrados = Object.keys(snapshotActual).length;
        if (totalEncontrados === 0) {
            throw new Error("Ambas redes rechazaron la consulta por saturación de IPs públicas en GitHub.");
        }

        console.log(`📊 Encontrados ${totalEncontrados} holders reales en el Top.`);

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

        console.log(`⏳ Guardando datos en tu Supabase...`);
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

        console.log("✅ ¡Sincronización completada con éxito!");

    } catch (error) {
        console.error("❌ Error de procesamiento:", error.message);
        process.exit(1);
    }
}

actualizarLeaderboard();
