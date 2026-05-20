(function (global) {
    'use strict';

    function extractAssistantEvidence(content) {
        const raw = String(content || '');
        const marker = /\s*【依据】\s*([A-Za-z0-9_,，、\-\s]+)\s*$/;
        const match = raw.match(marker);
        if (!match) {
            return { visibleContent: raw, patentIds: [] };
        }
        const ids = match[1]
            .split(/[，,、\s]+/)
            .map(item => item.trim())
            .filter(Boolean);
        const visibleContent = raw.replace(marker, '').trim();
        return { visibleContent, patentIds: ids };
    }

    function resolveEvidencePatents({ patentIds = [], patents = [], inventors = [] } = {}) {
        const idSet = Array.from(new Set((Array.isArray(patentIds) ? patentIds : []).filter(Boolean)));
        return idSet
            .map(id => {
                const patent = (Array.isArray(patents) ? patents : []).find(item => item && (item.id === id || item.publicationNumber === id));
                if (!patent) return null;
                const inventor = (Array.isArray(inventors) ? inventors : []).find(item => item && item.id === patent.inventorId) || null;
                return {
                    id: patent.id,
                    publicationNumber: patent.publicationNumber || patent.id,
                    title: patent.title || 'Untitled patent',
                    scholarName: inventor && inventor.name || patent.leadInventor || 'Unknown scholar',
                    href: `patent-detail.html?id=${encodeURIComponent(patent.id)}`
                };
            })
            .filter(Boolean);
    }

    function isDevHost(location) {
        const current = location || {};
        const protocol = String(current.protocol || '');
        const hostname = String(current.hostname || '').toLowerCase();
        return protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    }

    function warnPersonaBoundaryHints({ reply = '', persona = null, logger = console, location = global.location } = {}) {
        if (!isDevHost(location) || !persona) return;
        const text = String(reply || '');
        const avoidPhrases = Array.isArray(persona.avoidPhrases) ? persona.avoidPhrases : [];
        const avoidTopics = Array.isArray(persona.avoidTopics) ? persona.avoidTopics : [];

        avoidPhrases.forEach(phrase => {
            if (phrase && text.includes(String(phrase))) {
                logger.warn(`[PersonaLint] avoidPhrase hit: ${phrase}`);
            }
        });

        avoidTopics.forEach(topic => {
            if (topic && text.includes(String(topic))) {
                logger.warn(`[PersonaLint] avoidTopic hit: ${topic}`);
            }
        });
    }

    global.ChatEvidence = {
        extractAssistantEvidence,
        resolveEvidencePatents,
        warnPersonaBoundaryHints,
        isDevHost
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);

