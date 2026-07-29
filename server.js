let globalMessages = [];
const serverChats = new Map(); // Armazena mensagens de cada servidor { serverId: [messages] }
const presenceMap = new Map(); // Armazena presença de cada servidor { serverId: { userKey: timestamp } }
const rateLimitMap = new Map(); // Rate limit na memória

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const method = request.method;

        const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*" 
            }
        });

        const getBody = async () => {
            try { return await request.json(); } catch { return {}; }
        };

        const now = Date.now();

        // --- CHAT GLOBAL (IN-MEMORY) ---

        if (method === "POST" && url.pathname === "/api/manox/chat") {
            const { username, userId, message } = await getBody();
            if (!username || !message || !username.trim() || !message.trim()) {
                return jsonResponse({ success: false, message: "Dados inválidos." }, 400);
            }

            const cleanMessage = message.trim().slice(0, 200);
            const userKey = String(userId || username).toLowerCase();

            // Rate Limit de 2 segundos na memória RAM
            const lastTime = rateLimitMap.get(userKey);
            if (lastTime && (now - lastTime < 2000)) {
                return jsonResponse({ success: false, message: "Espere um pouco antes de enviar outra mensagem." }, 429);
            }
            rateLimitMap.set(userKey, now);

            const chatMessage = {
                id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
                username: username.trim(),
                userId: userId || null,
                message: cleanMessage,
                createdAt: now
            };

            // Adiciona a mensagem e mantém no máximo 100
            globalMessages.push(chatMessage);
            if (globalMessages.length > 100) globalMessages.shift();

            return jsonResponse({ success: true, message: chatMessage });
        }

        if (method === "GET" && url.pathname === "/api/manox/get-chat") {
            return jsonResponse({ success: true, messages: globalMessages });
        }

        // --- SERVER CHAT (IN-MEMORY) ---

        if (method === "POST" && url.pathname === "/api/manox/server-chat/presence") {
            const { serverId, username, userId } = await getBody();
            if (!serverId || !username) return jsonResponse({ success: false, message: "Dados inválidos." }, 400);

            const cleanServerId = serverId.trim();
            const userKey = String(userId || username).toLowerCase();

            if (!presenceMap.has(cleanServerId)) {
                presenceMap.set(cleanServerId, new Map());
            }
            
            const serverPresence = presenceMap.get(cleanServerId);
            serverPresence.set(userKey, now);

            // Limpa presença de usuários inativos há mais de 60s
            for (const [uKey, time] of serverPresence.entries()) {
                if (now - time > 60000) serverPresence.delete(uKey);
            }

            return jsonResponse({ success: true, online: serverPresence.size });
        }

        if (method === "POST" && url.pathname === "/api/manox/server-chat/send") {
            const { serverId, username, userId, message } = await getBody();
            if (!serverId || !username || !message) return jsonResponse({ success: false, message: "Dados inválidos." }, 400);

            const cleanServerId = serverId.trim();
            const userKey = String(userId || username).toLowerCase();

            // Atualiza presença
            if (!presenceMap.has(cleanServerId)) presenceMap.set(cleanServerId, new Map());
            presenceMap.get(cleanServerId).set(userKey, now);

            const chatMessage = {
                id: `server-${now}-${Math.random().toString(36).slice(2, 8)}`,
                username: username.trim(),
                userId: userId || null,
                message: message.trim().slice(0, 200),
                createdAt: now
            };

            if (!serverChats.has(cleanServerId)) {
                serverChats.set(cleanServerId, []);
            }

            const currentChat = serverChats.get(cleanServerId);
            currentChat.push(chatMessage);
            if (currentChat.length > 100) currentChat.shift();

            return jsonResponse({ success: true, message: chatMessage });
        }

        if (method === "GET" && url.pathname === "/api/manox/server-chat/messages") {
            const serverId = url.searchParams.get("serverId");
            if (!serverId) return jsonResponse({ success: false, message: "serverId inválido." }, 400);

            const messages = serverChats.get(serverId.trim()) || [];
            return jsonResponse({ success: true, messages });
        }

        return jsonResponse({ success: false, message: "Rota não encontrada" }, 404);
    }
};
