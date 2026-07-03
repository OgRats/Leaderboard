const fs = require('fs');

async function extraerTop100() {
    try {
        const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";
        const url = "https://api.roninchain.com/rpc";
        
        console.log("Conectando con Ronin...");
        
        const resBlock = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
        });
        const dataBlock = await resBlock.json();
        const ultimoBloqueNum = parseInt(dataBlock.result, 16);

        // GitHub Actions puede pedir bloques más grandes sin que lo bloqueen tan fácil.
        // Escaneamos los últimos 150,000 bloques para pillar todo el historial caliente real.
        const bloqueInicioNum = ultimoBloqueNum - 150000;
        const bloqueInicioHex = "0x" + bloqueInicioNum.toString(16);

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

        logs.forEach(log => {
            if (log.topics && log.topics.length >= 4) {
                const desde = "0x" + log.topics[1].substring(26).toLowerCase();
                const hacia = "0x" + log.topics[2].substring(26).toLowerCase();

                if (desde !== "0x0000000000000000000000000000000000000000") {
                    mapaBalances[desde] = (mapaBalances[desde] || 0) - 1;
                }
                mapaBalances[hacia] = (mapaBalances[hacia] || 0) + 1;
            }
        });

        const listaHolders = Object.keys(mapaBalances)
            .map(addr => ({
                address: addr,
                balance: mapaBalances[addr]
            }))
            .filter(h => h.balance > 0 && h.address !== "0x0000000000000000000000000000000000000000")
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 100);

        fs.writeFileSync('holders.json', JSON.stringify(listaHolders, null, 2));
        console.log("¡Archivo holders.json actualizado con éxito por el bot!");

    } catch (error) {
        console.error("Error en la extracción:", error);
        process.exit(1);
    }
}

extraerTop100();
