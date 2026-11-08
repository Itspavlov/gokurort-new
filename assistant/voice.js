// AssistantVoice: голос — задел на этап 6. Работает через Web Speech API браузера, если он есть; по умолчанию выключен.
export class AssistantVoice {
    static get canSpeak() { return 'speechSynthesis' in window; }
    static get canListen() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
    speak(text) {
        if (!AssistantVoice.canSpeak) return;
        try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'ru-RU'; u.rate = 1.02; speechSynthesis.speak(u); } catch (e) { }
    }
    stop() { try { speechSynthesis.cancel(); } catch (e) { } }
    listen(onText, onEnd) {
        const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return false;
        const r = new R(); r.lang = 'ru-RU'; r.interimResults = false; r.maxAlternatives = 1;
        r.onresult = e => { const t = e.results[0] && e.results[0][0] && e.results[0][0].transcript; if (t) onText(t); };
        r.onend = () => onEnd && onEnd(); r.onerror = () => onEnd && onEnd();
        try { r.start(); } catch (e) { return false; } return true;
    }
}
