const fs = require('fs');

async function extraerTop100() {
    try {
        const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";
        const url = "https://api.roninchain.com/rpc";
        
        console.log("Conectando con Ronin...");
        
        // 1. Obtener el bloque más reciente de la blockchain
        const resBlock = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
        });
        const dataBlock = await resBlock.json();
        const ultimoBloqueNum = parseInt(dataBlock.result, 16);

        // 2. Ampliamos el rango a 5 millones de bloques para escanear todo el historial
        const bloqueInicioNum = ultimoBloqueNum - 5000000;
        const bloqueInicioHex = "0x" + bloqueInicioNum.toString(16);

        console.log(`Escaneando desde el bloque ${bloqueInicioNum} hasta el ${ultimoBloqueNum}...`);

        // 3. Solicitar los logs de transferencia al nodo de Ronin
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_getLogs",
                params: [{
                    address: contratoOgRats,
                    fromBlock: bloqueInicioHex,
                    toBlock: dataBlock.result
                }],
                id: 2
            })
        });

        const json = await response.json();
        const logs = json.result || [];
        const mapaBalances = {};

        console.log(`Se encontraron ${logs.length} eventos de transferencia.`);

        // 4. Procesar el historial para calcular los saldos actuales
        logs.forEach(log => {
            if (log.topics && log.topics.length >= 4) {
                const desde = "0x" + log.topics[1].substring(26).toLowerCase();
                const hacia = "0x" + log.topics[2].substring(26).toLowerCase();

                // Si no es acuñación (mint), restar 1 al que envía
                if (desde !== "0x0000000000000000000000000000000000000000") {
                    mapaBalances[desde] = (mapaBalances[desde] || 0) - 1;
                }
                // Sumar 1 al que recibe
                mapaBalances[hacia] = (mapaBalances[hacia] || 0) + 1;
            }
        });

        // 5. Filtrar las wallets con balance positivo, ordenar de mayor a menor y tomar el Top 100
        const listaHolders = Object.keys(mapaBalances)
            .map(addr => ({
                address: addr,
                balance: mapaBalances[addr]
            }))
            .filter(h => h.balance > 0 && h.address !== "0x0000000000000000000000000000000000000000")
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 100);

        // 6. Guardar el resultado en el archivo JSON
        fs.writeFileSync('holders.json', JSON.stringify(listaHolders, null, 2));
        console.log(`¡Archivo holders.json guardado con éxito! Encontrados ${listaHolders.length} holders.`);

    } catch (error) {
        console.error("Error en la extracción:", error);
        process.exit(1);
    }
}

extraerTop100();
