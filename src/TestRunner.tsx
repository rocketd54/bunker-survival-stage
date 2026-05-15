import { useState, useRef, useEffect } from "react";
import { StageUI, INITIAL_STATE, parseTagsFromResponse, buildPromptInjection } from "./Stage";

// ============================================================
//  TEST SCENARIOS
// ============================================================

const SIMULATIONS = [
    {
        label: "⏰ Time passes (+3h)",
        tag: "[TIME:+3h] The hours slip by quietly. Elara reads on the couch.",
    },
    {
        label: "🔓 Unlock Kitchen",
        tag: "[UNLOCK:kitchen] You pry open the storage door. A kitchen lies beyond. [TIME:+1h]",
    },
    {
        label: "🔓 Unlock Medical Bay",
        tag: "[UNLOCK:medical] The medical bay door swings open. Supplies inside. [TIME:+0h]",
    },
    {
        label: "💚 Elara Affection +10",
        tag: "You share a quiet moment with Elara. [STAT:elara.affection+10] [STAT:elara.stress-5] [TIME:+1h]",
    },
    {
        label: "😟 Elara Corruption +8",
        tag: "Elara seems distant lately. [STAT:elara.corruption+8] [STAT:elara.affection-5] [TIME:+2h]",
    },
    {
        label: "🚪 Rook Arrives",
        tag: "A knock at the blast door. [ARRIVE:rook] Rook steps inside, scanning the bunker warily. [TIME:+0h]",
    },
    {
        label: "🚪 Vera Arrives",
        tag: "Movement outside. Then a voice. [ARRIVE:vera] Vera slips through the entrance, breathless. [TIME:+0h]",
    },
    {
        label: "🌿 Discover Botany Lab",
        tag: "Behind a false wall you find a hidden room. [UNLOCK:botany] The botany lab, untouched since the collapse. [TIME:+1h]",
    },
    {
        label: "💪 Discover Gym",
        tag: "A reinforced door at the end of the corridor. [UNLOCK:gym] A training room. Rook will like this. [TIME:+1h]",
    },
    {
        label: "🤕 Rook Injured",
        tag: "The scavenge goes badly. [INJURY:rook] Rook limps back, bleeding. [TIME:+4h] [STAT:rook.stamina-30]",
    },
    {
        label: "❤️‍🩹 Heal Rook",
        tag: "Elara works through the night. [HEAL:rook] [TIME:+8h] [STAT:elara.stamina-20]",
    },
    {
        label: "⬆️ Upgrade Kitchen",
        tag: "You install the salvaged cookware. [UPGRADE:kitchen:Salvaged Cookware] Meals will be better now. [TIME:+2h]",
    },
    {
        label: "📦 Scavenge (Green Zone)",
        tag: "A cautious run. [TIME:+3h] [STAT:shelter.food+2] [STAT:shelter.materials+1] You return safely.",
    },
    {
        label: "⚠️ Scavenge (Red Zone)",
        tag: "The red zone is a graveyard. [TIME:+6h] [STAT:shelter.materials+4] [STAT:shelter.medicine+3] [INJURY:rook] Barely made it back.",
    },
    {
        label: "🎬 Movie Night",
        tag: "Everyone gathers. [TIME:+2h] [STAT:elara.stress-15] [STAT:elara.affection+5] [ACT:elara:watching TV] A rare moment of peace.",
    },
    {
        label: "🚶 Move Elara → Kitchen",
        tag: "Elara heads to the kitchen to prepare something. [MOVE:elara:kitchen] [ACT:elara:cooking] [TIME:+1h]",
    },
    {
        label: "🏃 Move Player → Generator",
        tag: "You head down to check on the generator. [PLAYER:generator] [TIME:+0h]",
    },
];

// ============================================================
//  TYPES
// ============================================================

interface ChatMessage {
    role: "user" | "bot" | "system";
    text: string;
}

const C = {
    bg:"#0c0e0d", panel:"#111412", border:"#1e2820",
    accent:"#4d8560", text:"#c5d4bc", textDim:"#5e7060",
    user:"#1c2c1e", bot:"#141c14", system:"#111412",
    danger:"#c0392b",
};

// ============================================================
//  TEST RUNNER
// ============================================================

export default function TestRunner() {
    const [gameState, setGameState] = useState(() => JSON.parse(JSON.stringify(INITIAL_STATE)));
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: "system",
            text: "Day 1 — The blast door sealed. Use the simulation buttons below to test game events, or type your own tags in the input.",
        },
    ]);
    const [input, setInput] = useState("");
    const [showPrompt, setShowPrompt] = useState(false);
    const chatRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, [messages]);

    function simulateBot(text: string) {
        setMessages(prev => [...prev, { role: "bot", text }]);
        setGameState((prev: typeof INITIAL_STATE) => parseTagsFromResponse(text, prev));
    }

    function handleUserSend() {
        if (!input.trim()) return;
        const userText = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: "user", text: userText }]);
        const injection = buildPromptInjection(gameState);
        setMessages(prev => [...prev, {
            role: "system",
            text: `[Prompt injection that would be sent to LLM]\n${injection}`,
        }]);
    }

    function resetState() {
        setGameState(JSON.parse(JSON.stringify(INITIAL_STATE)));
        setMessages([{ role: "system", text: "State reset to Day 1." }]);
    }

    return (
        <div style={{
            width: "100vw", height: "100vh",
            background: C.bg,
            display: "flex",
            fontFamily: "'Courier New', Courier, monospace",
            overflow: "hidden",
        }}>

            {/* LEFT — controls */}
            <div style={{
                width: 320, flexShrink: 0,
                borderRight: `1px solid ${C.border}`,
                display: "flex", flexDirection: "column",
                overflow: "hidden",
            }}>

                {/* Header */}
                <div style={{
                    background: C.panel, borderBottom: `1px solid ${C.border}`,
                    padding: "6px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                    <span style={{ color: C.accent, fontSize: 10, letterSpacing: "0.15em" }}>TEST RUNNER</span>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={() => setShowPrompt(p => !p)}
                            style={{
                                background: "transparent", border: `1px solid ${C.border}`,
                                color: C.textDim, fontSize: 9, padding: "2px 8px",
                                borderRadius: 3, cursor: "pointer", fontFamily: "inherit",
                            }}
                        >
                            {showPrompt ? "hide prompt" : "show prompt"}
                        </button>
                        <button
                            onClick={resetState}
                            style={{
                                background: "transparent", border: `1px solid ${C.danger}44`,
                                color: C.danger, fontSize: 9, padding: "2px 8px",
                                borderRadius: 3, cursor: "pointer", fontFamily: "inherit",
                            }}
                        >
                            reset
                        </button>
                    </div>
                </div>

                {/* Prompt preview */}
                {showPrompt && (
                    <div style={{
                        background: "#090c09", borderBottom: `1px solid ${C.border}`,
                        padding: "8px 10px", fontSize: 8, color: C.textDim,
                        whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto",
                        lineHeight: 1.5,
                    }}>
                        {buildPromptInjection(gameState)}
                    </div>
                )}

                {/* Chat log */}
                <div
                    ref={chatRef}
                    style={{
                        flex: 1, overflowY: "auto", padding: "8px 10px",
                        display: "flex", flexDirection: "column", gap: 5,
                    }}
                >
                    {messages.map((m, i) => (
                        <div key={i} style={{
                            background: m.role === "user" ? C.user : m.role === "bot" ? C.bot : C.system,
                            border: `1px solid ${C.border}`,
                            borderRadius: 4, padding: "6px 9px",
                        }}>
                            <div style={{ color: C.accent, fontSize: 8, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                {m.role === "user" ? "{{user}}" : m.role === "bot" ? "Narrator" : "System"}
                            </div>
                            <div style={{ color: C.text, fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                                {m.text}
                            </div>
                        </div>
                    ))}
                </div>

                {/* User input */}
                <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 10px", display: "flex", gap: 6 }}>
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleUserSend()}
                        placeholder="Type a message or [TAG:...]"
                        style={{
                            flex: 1, background: "#0f1410", border: `1px solid ${C.border}`,
                            borderRadius: 3, padding: "5px 8px",
                            color: C.text, fontSize: 10, fontFamily: "inherit", outline: "none",
                        }}
                    />
                    <button
                        onClick={handleUserSend}
                        style={{
                            background: C.accent, border: "none", borderRadius: 3,
                            color: "#fff", fontSize: 10, padding: "5px 12px", cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        Send
                    </button>
                </div>

                {/* Simulation buttons */}
                <div style={{
                    borderTop: `1px solid ${C.border}`,
                    padding: "8px 10px", maxHeight: 260, overflowY: "auto",
                }}>
                    <div style={{ color: C.textDim, fontSize: 8, marginBottom: 6, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                        Simulate Bot Response
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {SIMULATIONS.map(sim => (
                            <button
                                key={sim.label}
                                onClick={() => simulateBot(sim.tag)}
                                style={{
                                    background: "#141c14", border: `1px solid ${C.border}`,
                                    borderRadius: 3, color: C.text, fontSize: 9,
                                    padding: "4px 8px", cursor: "pointer", textAlign: "left",
                                    fontFamily: "inherit",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#1c2c1c")}
                                onMouseLeave={e => (e.currentTarget.style.background = "#141c14")}
                            >
                                {sim.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT — live Stage UI rendered directly via StageUI component */}
            <div style={{ flex: 1, overflow: "hidden" }}>
                <StageUI state={gameState} />
            </div>
        </div>
    );
}