const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const cargando = ref(true);
        const holders = ref([]);
        const tiempo = ref({ horas: "00", minutos: "00", segundos: "00" });
        
        // Fecha de inicio del conteo (Año 2026)
        const fechaInicioConteo = Math.floor(new Date("2026-06-25T00:00:00Z").getTime() / 1000);

        // CONFIGURACIÓN BLOCKCHAIN DIRECTA
        const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";
        const urlRonin = "https://api.roninchain.com/rpc";

        const consultarBlockchainDirecto = async () => {
            try {
                console.log("Consultando mercado de Ronin en tiempo real...");
                
                // 1. Obtener el bloque actual
                const resBlock = await fetch(urlRonin, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
                });
                const dataBlock = await resBlock.json();
                const ultimoBloqueNum = parseInt(dataBlock.result, 16);

                // 2. Definir rango seguro de bloques (Últimas horas/días de historial)
                const bloqueInicioNum = ultimoBloqueNum - 300000;
                const bloqueInicioHex = "0x" + bloqueInicioNum.toString(16);

                // 3. Pedir los logs de transferencia directamente
                const response = await fetch(urlRonin, {
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

                // 4. Procesar transferencias en el navegador
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

                // 5. Convertir a lista filtrada
                holders.value = Object.keys(mapaBalances)
                    .map(addr => ({
                        address: addr,
                        balance: mapaBalances[addr]
                    }))
                    .filter(h => h.balance > 0 && h.address !== "0x0000000000000000000000000000000000000000");

            } catch (error) {
                console.error("Error obteniendo datos directos de Ronin:", error);
            } finally {
                cargando.value = false;
            }
        };

        const calcularPuntosActuales = (holder) => {
            const ahora = new Date();
            const hoyUTC = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
            const dias = Math.floor((hoyUTC - (fechaInicioConteo * 1000)) / (1000 * 60 * 60 * 24));
            return dias > 0 ? (dias * holder.balance) : 0;
        };

        const holdersOrdenados = computed(() => {
            return [...holders.value]
                .map(h => ({ ...h, puntosCalculados: calcularPuntosActuales(h) }))
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 100);
        });

        const actualizarCuentaRegresiva = () => {
            const ahora = new Date();
            const mananaUTC = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1, 0, 0, 0));
            let totalSegundos = Math.floor((mananaUTC - ahora) / 1000);
            if (totalSegundos < 0) totalSegundos = 0;
            
            tiempo.value = {
                horas: String(Math.floor(totalSegundos / 3600)).padStart(2, '0'),
                minutos: String(Math.floor((totalSegundos % 3600) / 60)).padStart(2, '0'),
                segundos: String(totalSegundos % 60).padStart(2, '0')
            };
        };

        onMounted(async () => {
            await consultarBlockchainDirecto();
            actualizarCuentaRegresiva();
            setInterval(actualizarCuentaRegresiva, 1000);

            // Auto-actualizar el mercado cada 5 minutos mientras el usuario tenga la web abierta
            setInterval(async () => {
                await consultarBlockchainDirecto();
            }, 300000);
        });

        return { 
            cargando, 
            holdersOrdenados, 
            tiempo, 
            formatearDireccion: (a) => a ? a.substring(0, 6) + '...' + a.substring(a.length - 4) : '' 
        };
    }
}).mount('#app');
