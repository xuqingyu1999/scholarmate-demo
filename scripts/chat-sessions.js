(function (global) {
    'use strict';

    const STORAGE_KEY = 'scholarmate_chat_sessions_v2';
    const DEFAULT_TITLE = '新的技术顾问对话';

    function nowIso() {
        return new Date().toISOString();
    }

    function createId() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') {
            return global.crypto.randomUUID();
        }
        return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function readAll() {
        try {
            return JSON.parse(global.localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (error) {
            console.warn('Failed to read chat sessions:', error);
            return [];
        }
    }

    function writeAll(sessions) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }

    function normalizeSession(session) {
        const createdAt = session.createdAt || nowIso();
        return {
            sessionId: session.sessionId || createId(),
            inventorId: session.inventorId || '',
            patentId: session.patentId || '',
            projectId: session.projectId || '',
            title: session.title || DEFAULT_TITLE,
            createdAt,
            updatedAt: session.updatedAt || createdAt,
            provider: session.provider || 'local-demo',
            model: session.model || '',
            legacyKey: session.legacyKey || '',
            messages: Array.isArray(session.messages) ? session.messages : []
        };
    }

    function deriveTitle(content) {
        const compact = String(content || '').replace(/\s+/g, ' ').trim();
        if (!compact) return DEFAULT_TITLE;
        return compact.length > 22 ? `${compact.slice(0, 22)}...` : compact;
    }

    function createSession(context = {}) {
        const session = normalizeSession({
            sessionId: context.sessionId,
            inventorId: context.inventorId,
            patentId: context.patentId,
            projectId: context.projectId,
            title: context.title || DEFAULT_TITLE,
            provider: context.provider,
            model: context.model,
            messages: []
        });
        const sessions = readAll();
        sessions.unshift(session);
        writeAll(sessions);
        return session;
    }

    function getSession(sessionId) {
        return readAll().find(session => session.sessionId === sessionId) || null;
    }

    function upsertSession(nextSession) {
        const normalized = normalizeSession(nextSession);
        const sessions = readAll();
        const index = sessions.findIndex(session => session.sessionId === normalized.sessionId);
        if (index >= 0) sessions[index] = normalized;
        else sessions.unshift(normalized);
        sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        writeAll(sessions);
        return normalized;
    }

    function addMessage(sessionId, message) {
        const session = getSession(sessionId);
        if (!session) throw new Error('Chat session not found');
        const time = message.time || nowIso();
        session.messages.push({
            role: message.role,
            content: message.content,
            time,
            inventorId: session.inventorId,
            patentId: session.patentId,
            projectId: session.projectId
        });
        if (session.title === DEFAULT_TITLE && message.role === 'user') {
            session.title = deriveTitle(message.content);
        }
        session.provider = message.provider || session.provider;
        session.model = message.model || session.model;
        session.updatedAt = time;
        return upsertSession(session);
    }

    function listAll() {
        return readAll().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    function listByInventor(inventorId) {
        return listAll().filter(session => session.inventorId === inventorId);
    }

    function migrateLegacy() {
        const sessions = readAll();
        const existingLegacyKeys = new Set(sessions.map(session => session.legacyKey).filter(Boolean));
        const migrated = [];

        for (let index = 0; index < global.localStorage.length; index += 1) {
            const key = global.localStorage.key(index);
            if (!key || !key.startsWith('chat_history_') || existingLegacyKeys.has(key)) continue;
            try {
                const messages = JSON.parse(global.localStorage.getItem(key) || '[]');
                if (!Array.isArray(messages) || !messages.length) continue;
                const first = messages[0] || {};
                const last = messages[messages.length - 1] || first;
                migrated.push(normalizeSession({
                    sessionId: `legacy_${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
                    inventorId: first.inventorId || last.inventorId || '',
                    patentId: first.patentId || last.patentId || '',
                    projectId: first.projectId || last.projectId || '',
                    title: deriveTitle((messages.find(message => message.role === 'user') || first).content),
                    createdAt: first.time || nowIso(),
                    updatedAt: last.time || first.time || nowIso(),
                    provider: 'legacy-local',
                    model: '',
                    legacyKey: key,
                    messages
                }));
            } catch (error) {
                console.warn('Failed to migrate legacy chat history:', key, error);
            }
        }

        if (migrated.length) {
            writeAll([...migrated, ...sessions].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
        }
        return migrated.length;
    }

    function clearSession(sessionId) {
        writeAll(readAll().filter(session => session.sessionId !== sessionId));
    }

    global.ChatSessions = {
        STORAGE_KEY,
        DEFAULT_TITLE,
        createSession,
        getSession,
        upsertSession,
        addMessage,
        listAll,
        listByInventor,
        migrateLegacy,
        clearSession
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
