export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const method = request.method;

        const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

        const getBody = async () => {
            try { return await request.json(); } catch { return {}; }
        };

        // --- CHAT GLOBAL ---
        if (method === "POST" && url.pathname === "/api/manox/chat") {
            const { username, userId, message } = await getBody();
            if (!username || !message || !username.trim() || !message.trim()) {
                return jsonResponse({ success: false, message: "Dados inválidos." }, 400);
            }

            const cleanMessage = message.trim().slice(0, 200);
            const userKey = `ratelimit:${String(userId || username).toLowerCase()}`;
            const now = Date.now();

            const lastTime = await env.MANOX_KV.get(userKey);
            if (lastTime && (now - parseInt(lastTime) < 2000)) {
                return jsonResponse({ success: false, message: "Espere um pouco." }, 429);
            }
            await env.MANOX_KV.put(userKey, String(now), { expirationTtl: 60 });

            const chatMessage = {
                id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
                username: username.trim(),
                userId: userId || null,
                message: cleanMessage,
                createdAt: now
            };

            let globalMessages = await env.MANOX_KV.get("global_messages", "json") || [];
            globalMessages.push(chatMessage);
            if (globalMessages.length > 100) globalMessages.shift();
            await env.MANOX_KV.put("global_messages", JSON.stringify(globalMessages));

            return jsonResponse({ success: true, message: chatMessage });
        }

        if (method === "GET" && url.pathname === "/api/manox/get-chat") {
            const messages = await env.MANOX_KV.get("global_messages", "json") || [];
            return jsonResponse({ success: true, messages });
        }

        // --- SERVER CHAT ---
        if (method === "POST" && url.pathname === "/api/manox/server-chat/presence") {
            const { serverId, username, userId } = await getBody();
            if (!serverId || !username) return jsonResponse({ success: false }, 400);

            const cleanServerId = serverId.trim();
            const userKey = String(userId || username).toLowerCase();
            await env.MANOX_KV.put(`presence:${cleanServerId}:${userKey}`, String(Date.now()), { expirationTtl: 60 });
            const list = await env.MANOX_KV.list({ prefix: `presence:${cleanServerId}:` });

            return jsonResponse({ success: true, online: list.keys.length });
        }

        if (method === "POST" && url.pathname === "/api/manox/server-chat/send") {
            const { serverId, username, userId, message } = await getBody();
            if (!serverId || !username || !message) return jsonResponse({ success: false }, 400);

            const cleanServerId = serverId.trim();
            const userKey = String(userId || username).toLowerCase();
            await env.MANOX_KV.put(`presence:${cleanServerId}:${userKey}`, String(Date.now()), { expirationTtl: 60 });

            const chatMessage = {
                id: `server-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                username: username.trim(),
                userId: userId || null,
                message: message.trim().slice(0, 200),
                createdAt: Date.now()
            };

            let serverChat = await env.MANOX_KV.get(`chat:${cleanServerId}`, "json") || [];
            serverChat.push(chatMessage);
            if (serverChat.length > 100) serverChat.shift();
            await env.MANOX_KV.put(`chat:${cleanServerId}`, JSON.stringify(serverChat), { expirationTtl: 1800 });

            return jsonResponse({ success: true, message: chatMessage });
        }

        if (method === "GET" && url.pathname === "/api/manox/server-chat/messages") {
            const serverId = url.searchParams.get("serverId");
            if (!serverId) return jsonResponse({ success: false }, 400);

            const messages = await env.MANOX_KV.get(`chat:${serverId.trim()}`, "json") || [];
            return jsonResponse({ success: true, messages });
        }

        return jsonResponse({ success: false, message: "Rota não encontrada" }, 404);
    }
};
