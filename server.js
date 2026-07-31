export default {
    async fetch(request, env) {
        const SUPABASE_URL = env.SUPABASE_URL;
        const SUPABASE_KEY = env.SUPABASE_KEY;

        const headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        };

        const url = new URL(request.url);
        const method = request.method;

        const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

        const getBody = async () => { try { return await request.json(); } catch { return {}; } };
        const now = Date.now();

        // --- CHAT GLOBAL ---

        if (method === "POST" && url.pathname === "/api/manox/chat") {
            const { username, userId, message } = await getBody();
            if (!username || !message || !username.trim() || !message.trim()) return jsonResponse({ success: false }, 400);

            const userKey = String(userId || username).toLowerCase().trim();

            // Verificar Rate Limit
            const limitRes = await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?user_key=eq.${encodeURIComponent(userKey)}`, { headers });
            const limitData = await limitRes.json();

            if (limitData && limitData.length > 0) {
                if (now - parseInt(limitData[0].last_sent, 10) < 2000) {
                    return jsonResponse({ success: false, message: "Espere um pouco antes de enviar outra mensagem." }, 429);
                }
            }

            // Atualiza timestamp do Rate Limit
            await fetch(`${SUPABASE_URL}/rest/v1/rate_limits`, {
                method: "POST",
                headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify({ user_key: userKey, last_sent: now })
            });

            const msgData = {
                id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
                username: username.trim(),
                user_id: userId || null,
                message: message.trim().slice(0, 200),
                created_at: now
            };

            await fetch(`${SUPABASE_URL}/rest/v1/global_messages`, {
                method: "POST",
                headers,
                body: JSON.stringify(msgData)
            });

            return jsonResponse({ success: true, message: msgData });
        }

        if (method === "GET" && url.pathname === "/api/manox/get-chat") {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/global_messages?select=*&order=created_at.desc&limit=50`, { headers });
            const messages = await res.json();
            return jsonResponse({ success: true, messages: Array.isArray(messages) ? messages.reverse() : [] });
        }

        // --- SERVER CHAT & PRESENÇA ---

        if (method === "POST" && url.pathname === "/api/manox/server-chat/presence") {
            const { serverId, username, userId } = await getBody();
            if (!serverId || !username) return jsonResponse({ success: false }, 400);

            const cleanServerId = serverId.trim();
            const userKey = String(userId || username).toLowerCase().trim();
            const presenceId = `${cleanServerId}:${userKey}`;

            await fetch(`${SUPABASE_URL}/rest/v1/server_presence`, {
                method: "POST",
                headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify({ id: presenceId, server_id: cleanServerId, user_key: userKey, last_seen: now })
            });

            const ONE_MINUTE_AGO = now - 60000;
            const res = await fetch(`${SUPABASE_URL}/rest/v1/server_presence?server_id=eq.${encodeURIComponent(cleanServerId)}&last_seen=gt.${ONE_MINUTE_AGO}`, { headers });
            const onlineData = await res.json();

            return jsonResponse({ success: true, online: Array.isArray(onlineData) ? onlineData.length : 0 });
        }

        if (method === "POST" && url.pathname === "/api/manox/server-chat/send") {
            const { serverId, username, userId, message } = await getBody();
            if (!serverId || !username || !message) return jsonResponse({ success: false }, 400);

            const cleanServerId = serverId.trim();

            const msgData = {
                id: `server-${now}-${Math.random().toString(36).slice(2, 8)}`,
                server_id: cleanServerId,
                username: username.trim(),
                user_id: userId || null,
                message: message.trim().slice(0, 200),
                created_at: now
            };

            await fetch(`${SUPABASE_URL}/rest/v1/server_messages`, {
                method: "POST",
                headers,
                body: JSON.stringify(msgData)
            });

            return jsonResponse({ success: true, message: msgData });
        }

        if (method === "GET" && url.pathname === "/api/manox/server-chat/messages") {
            const serverId = url.searchParams.get("serverId");
            if (!serverId) return jsonResponse({ success: false }, 400);

            const res = await fetch(`${SUPABASE_URL}/rest/v1/server_messages?server_id=eq.${encodeURIComponent(serverId.trim())}&order=created_at.desc&limit=50`, { headers });
            const messages = await res.json();

            return jsonResponse({ success: true, messages: Array.isArray(messages) ? messages.reverse() : [] });
        }

        return jsonResponse({ success: false, message: "Rota não encontrada" }, 404);
    }
};
