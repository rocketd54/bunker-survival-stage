import { ReactElement, useState } from "react";
import { StageBase, StageResponse, InitialData, Message } from "@chub-ai/stages-ts";
import { LoadResponse } from "@chub-ai/stages-ts/dist/types/load";

// ============================================================
//  TYPES
// ============================================================

type RoomStatus = "wall" | "hidden" | "locked" | "accessible" | "hallway" | "scavenge";

interface Room {
    id: string;
    label: string;
    status: RoomStatus;
    zone?: "green" | "yellow" | "red";
    upgraded?: boolean;
    upgrades?: string[];
    col: number;
    row: number;
    colSpan?: number;
    rowSpan?: number;
}

interface CharacterStats {
    id: string;
    name: string;
    hunger: number;
    stamina: number;
    stress: number;
    loyalty: number;
    affection: number;
    corruption: number;
    currentRoom: string;
    currentAct: string;
    actHoursLeft: number;
    present: boolean;
    injured: boolean;
    skills: {
        medical: number;
        cooking: number;
        scavenging: number;
        fitness: number;
        social: number;
    };
}

interface ShelterStats {
    food: number;
    water: number;
    power: number;
    medicine: number;
    materials: number;
}

interface MessageStateType {
    day: number;
    hour: number;
    characters: { [key: string]: CharacterStats };
    shelter: ShelterStats;
    rooms: { [key: string]: Room };
    playerRoom: string;
    log: string[];
}

type ConfigType = any;
type InitStateType = any;
type ChatStateType = any;

// ============================================================
//  MAP LAYOUT
//  8 cols × 9 rows. Wall cells fill every unused position so
//  the grid reads as a solid floor plan.
//
//  Grid sketch (col 1-8, row 1-9):
//
//  Row 1:  WALL  | Vera's Room (2-3) | WALL | Rook's Room (5-6) | WALL | WALL
//  Row 2:  YourRoom | Hall_top(2-4) | Elara's Room(5-6) | WALL | WALL
//  Row 3:  Hall_left | Living(2-3) | Hall_right(4) | Botany(5-6) | WALL | WALL
//  Row 4:  Hall_left | Living(2-3) | Hall_right(4) | Botany(5-6) | WALL | WALL
//  Row 5:  Medical(1-2) | Hall_mid(3) | Kitchen(4-5) | Gym(6-7) | WALL
//  Row 6:  Hall_down(1-2) | Hall_mid(3) | Hall_kitch(4-5) | WALL | WALL | WALL
//  Row 7:  Generator(1-2) | Hall_bot(3-4) | Storage(5-6) | WALL | WALL
//  Row 8:  WALL(gap row between bunker and outside)
//  Row 9:  GreenZone(1-2) | YellowZone(3-4) | RedZone(5-6) | WALL | WALL
// ============================================================

const INITIAL_ROOMS: { [key: string]: Room } = {

    // ── ROW 1 ───────────────────────────────────────────────────
    w1_1:        { id:"w1_1",       label:"",              status:"wall",       col:1, row:1 },
    bed_vera:    { id:"bed_vera",   label:"Vera's Room",   status:"hidden",     col:2, row:1, colSpan:2 },
    w1_4:        { id:"w1_4",       label:"",              status:"wall",       col:4, row:1 },
    bed_rook:    { id:"bed_rook",   label:"Rook's Room",   status:"hidden",     col:5, row:1, colSpan:2 },
    w1_7:        { id:"w1_7",       label:"",              status:"wall",       col:7, row:1 },
    w1_8:        { id:"w1_8",       label:"",              status:"wall",       col:8, row:1 },

    // ── ROW 2 ───────────────────────────────────────────────────
    bed_player:  { id:"bed_player", label:"Your Room",     status:"accessible", col:1, row:2 },
    hall_top:    { id:"hall_top",   label:"Hallway",       status:"hallway",    col:2, row:2, colSpan:3 },
    bed_elara:   { id:"bed_elara",  label:"Elara's Room",  status:"accessible", col:5, row:2, colSpan:2 },
    w2_7:        { id:"w2_7",       label:"",              status:"wall",       col:7, row:2 },
    w2_8:        { id:"w2_8",       label:"",              status:"wall",       col:8, row:2 },

    // ── ROWS 3-4 ─────────────────────────────────────────────────
    hall_left:   { id:"hall_left",  label:"Hallway",       status:"hallway",    col:1, row:3, rowSpan:2 },
    living:      { id:"living",     label:"Living Room",   status:"accessible", col:2, row:3, colSpan:2, rowSpan:2 },
    hall_right:  { id:"hall_right", label:"Hallway",       status:"hallway",    col:4, row:3, rowSpan:2 },
    botany:      { id:"botany",     label:"Botany Lab",    status:"hidden",     col:5, row:3, colSpan:2, rowSpan:2 },
    w3_7:        { id:"w3_7",       label:"",              status:"wall",       col:7, row:3 },
    w3_8:        { id:"w3_8",       label:"",              status:"wall",       col:8, row:3 },
    w4_7:        { id:"w4_7",       label:"",              status:"wall",       col:7, row:4 },
    w4_8:        { id:"w4_8",       label:"",              status:"wall",       col:8, row:4 },

    // ── ROW 5 ────────────────────────────────────────────────────
    medical:     { id:"medical",    label:"Medical Bay",   status:"locked",     col:1, row:5, colSpan:2 },
    hall_mid:    { id:"hall_mid",   label:"Hallway",       status:"hallway",    col:3, row:5, rowSpan:2 },
    kitchen:     { id:"kitchen",    label:"Kitchen",       status:"locked",     col:4, row:5, colSpan:2 },
    gym:         { id:"gym",        label:"Gym",           status:"hidden",     col:6, row:5, colSpan:2, rowSpan:2 },
    // col 8 row 5 covered by gym span

    // ── ROW 6 ────────────────────────────────────────────────────
    hall_down:   { id:"hall_down",  label:"Hallway",       status:"hallway",    col:1, row:6, colSpan:2 },
    // hall_mid spans row 5-6 col 3
    hall_kitch:  { id:"hall_kitch", label:"Hallway",       status:"hallway",    col:4, row:6, colSpan:2 },
    // gym spans rows 5-6 cols 6-7

    // ── ROW 7 ────────────────────────────────────────────────────
    generator:   { id:"generator",  label:"Generator",     status:"accessible", col:1, row:7, colSpan:2 },
    hall_bot:    { id:"hall_bot",   label:"Hallway",       status:"hallway",    col:3, row:7, colSpan:2 },
    storage:     { id:"storage",    label:"Storage",       status:"accessible", col:5, row:7, colSpan:2 },
    w7_7:        { id:"w7_7",       label:"",              status:"wall",       col:7, row:7 },
    w7_8:        { id:"w7_8",       label:"",              status:"wall",       col:8, row:7 },

    // ── ROW 8 — gap strip between bunker and outside ─────────────
    w8_1:        { id:"w8_1",       label:"",              status:"wall",       col:1, row:8 },
    w8_2:        { id:"w8_2",       label:"",              status:"wall",       col:2, row:8 },
    w8_3:        { id:"w8_3",       label:"",              status:"wall",       col:3, row:8 },
    w8_4:        { id:"w8_4",       label:"",              status:"wall",       col:4, row:8 },
    w8_5:        { id:"w8_5",       label:"",              status:"wall",       col:5, row:8 },
    w8_6:        { id:"w8_6",       label:"",              status:"wall",       col:6, row:8 },
    w8_7:        { id:"w8_7",       label:"",              status:"wall",       col:7, row:8 },
    w8_8:        { id:"w8_8",       label:"",              status:"wall",       col:8, row:8 },

    // ── ROW 9 — scavenge zones ────────────────────────────────────
    zone_green:  { id:"zone_green",  label:"Green Zone",   status:"scavenge",   zone:"green",  col:1, row:9, colSpan:2 },
    zone_yellow: { id:"zone_yellow", label:"Yellow Zone",  status:"scavenge",   zone:"yellow", col:3, row:9, colSpan:2 },
    zone_red:    { id:"zone_red",    label:"Red Zone",     status:"scavenge",   zone:"red",    col:5, row:9, colSpan:2 },
    w9_7:        { id:"w9_7",        label:"",             status:"wall",       col:7, row:9 },
    w9_8:        { id:"w9_8",        label:"",             status:"wall",       col:8, row:9 },
};

const INITIAL_CHARACTERS: { [key: string]: CharacterStats } = {
    elara: {
        id:"elara", name:"Elara", present:true,
        hunger:20, stamina:80, stress:30,
        loyalty:85, affection:60, corruption:0,
        currentRoom:"living", currentAct:"socializing", actHoursLeft:1,
        injured:false,
        skills:{ medical:75, cooking:45, scavenging:30, fitness:40, social:80 },
    },
    vera: {
        id:"vera", name:"Vera", present:false,
        hunger:0, stamina:100, stress:0,
        loyalty:50, affection:40, corruption:0,
        currentRoom:"bed_vera", currentAct:"resting", actHoursLeft:1,
        injured:false,
        skills:{ medical:30, cooking:80, scavenging:40, fitness:45, social:75 },
    },
    rook: {
        id:"rook", name:"Rook", present:false,
        hunger:0, stamina:100, stress:0,
        loyalty:50, affection:30, corruption:0,
        currentRoom:"gym", currentAct:"training", actHoursLeft:2,
        injured:false,
        skills:{ medical:20, cooking:25, scavenging:85, fitness:90, social:40 },
    },
};

export const INITIAL_STATE: MessageStateType = {
    day:1, hour:8,
    characters: INITIAL_CHARACTERS,
    shelter:{ food:7, water:10, power:80, medicine:5, materials:3 },
    rooms: INITIAL_ROOMS,
    playerRoom:"living",
    log:["Day 1 — The blast door sealed. Outside, the world ended."],
};

// ============================================================
//  TAG PARSER
// ============================================================

export function parseTagsFromResponse(
    response: string,
    state: MessageStateType
): MessageStateType {
    let s: MessageStateType = JSON.parse(JSON.stringify(state));

    const timeMatch = response.match(/\[TIME:\+(\d+)h\]/i);
    if (timeMatch) {
        const hrs = parseInt(timeMatch[1]);
        s.hour += hrs;
        while (s.hour >= 24) { s.hour -= 24; s.day += 1; }
        Object.values(s.characters).forEach(c => {
            if (!c.present) return;
            c.hunger  = Math.min(100, c.hunger  + hrs * 3);
            c.stamina = Math.max(0,   c.stamina - hrs * 2);
            c.stress  = Math.min(100, c.stress  + hrs * 1);
        });
        const n = Object.values(s.characters).filter(c => c.present).length + 1;
        s.shelter.food  = Math.max(0, s.shelter.food  - hrs * n * 0.02);
        s.shelter.water = Math.max(0, s.shelter.water - hrs * n * 0.015);
    }

    [...response.matchAll(/\[UNLOCK:(\w+)\]/gi)].forEach(m => {
        const r = s.rooms[m[1]];
        if (!r) return;
        if (r.status === "hidden")       { r.status = "locked";      s.log.unshift(`Discovered: ${r.label}`); }
        else if (r.status === "locked")  { r.status = "accessible";  s.log.unshift(`Unlocked: ${r.label}`); }
    });

    [...response.matchAll(/\[ARRIVE:(\w+)\]/gi)].forEach(m => {
        const c = s.characters[m[1]];
        if (!c) return;
        c.present = true;
        s.log.unshift(`${c.name} has arrived at the shelter.`);
        const rm = s.rooms[`bed_${m[1]}`];
        if (rm) rm.status = "accessible";
    });

    [...response.matchAll(/\[STAT:(\w+)\.(\w+)([+-]\d+)\]/gi)].forEach(m => {
        const val = parseInt(m[3]);
        if (s.characters[m[1]]) {
            const c = s.characters[m[1]] as any;
            if (m[2] in c) c[m[2]] = Math.max(0, Math.min(100, c[m[2]] + val));
        } else if (m[1] === "shelter") {
            const sh = s.shelter as any;
            if (m[2] in sh) sh[m[2]] = Math.max(0, sh[m[2]] + val);
        }
    });

    [...response.matchAll(/\[MOVE:(\w+):(\w+)\]/gi)].forEach(m => {
        if (s.characters[m[1]] && s.rooms[m[2]]) s.characters[m[1]].currentRoom = m[2];
    });

    [...response.matchAll(/\[ACT:(\w+):([^\]]+)\]/gi)].forEach(m => {
        if (s.characters[m[1]]) s.characters[m[1]].currentAct = m[2];
    });

    [...response.matchAll(/\[INJURY:(\w+)\]/gi)].forEach(m => {
        if (s.characters[m[1]]) {
            s.characters[m[1]].injured = true;
            s.log.unshift(`${s.characters[m[1]].name} was injured!`);
        }
    });

    [...response.matchAll(/\[HEAL:(\w+)\]/gi)].forEach(m => {
        if (s.characters[m[1]]) {
            s.characters[m[1]].injured = false;
            s.log.unshift(`${s.characters[m[1]].name} recovered.`);
        }
    });

    [...response.matchAll(/\[UPGRADE:(\w+):([^\]]+)\]/gi)].forEach(m => {
        const r = s.rooms[m[1]];
        if (r) {
            r.upgraded = true;
            if (!r.upgrades) r.upgrades = [];
            r.upgrades.push(m[2]);
            s.log.unshift(`${r.label} upgraded: ${m[2]}`);
        }
    });

    const pm = response.match(/\[PLAYER:(\w+)\]/i);
    if (pm && s.rooms[pm[1]]) s.playerRoom = pm[1];

    return s;
}

// ============================================================
//  ROOM DESCRIPTIONS
//  What the LLM knows about each room — its contents, feel,
//  and what activities make sense there.
// ============================================================

const ROOM_DESCRIPTIONS: { [key: string]: string } = {
    bed_player:  "Your Room — a sparse bunk with a footlocker, a small lamp, and a shelf of personal items. Private, quiet.",
    bed_elara:   "Elara's Room — neatly kept, with hand-drawn sketches pinned to the wall and a few dog-eared books stacked beside the bed.",
    bed_vera:    "Vera's Room — claimed quickly after she arrived. Smells faintly of something floral she must have scavenged. Warm and personal.",
    bed_rook:    "Rook's Room — spartan. A cot, a weapons rack, a water-stained map pinned above the desk. Nothing wasted.",
    living:      "Living Room — the heart of the bunker. A worn sofa, a salvaged flatscreen TV that still works on generator power, a coffee table with mismatched mugs. The place everyone ends up eventually.",
    kitchen:     "Kitchen — functional but limited. A two-burner camp stove, canned goods on wire shelves, a hand-pump water filter. Smells like whatever was last cooked here.",
    medical:     "Medical Bay — former storage converted to a clinic. Cots, a locked cabinet of supplies, antiseptic smell. Elara keeps it organized.",
    generator:   "Generator Room — loud, warm, smells of diesel. The lifeline of the bunker. Gauges track fuel and output.",
    storage:     "Storage Room — floor-to-ceiling shelving. Crates, tarps, tools, spare parts. Half-inventoried, half-chaotic.",
    botany:      "Botany Lab — a hidden room with UV grow lights and hydroponic trays. Someone set this up before the collapse. Vegetables are still growing.",
    gym:         "Gym — rubber mats, free weights, a pull-up bar bolted to the ceiling. Rook spends most of his time here.",
    zone_green:  "Green Zone (Outside) — nearby streets, mostly clear. Abandoned shops and houses. Low risk, modest rewards. Takes ~3 hours.",
    zone_yellow: "Yellow Zone (Outside) — further out, signs of recent infected activity. Moderate risk, better loot. Takes ~5 hours.",
    zone_red:    "Red Zone (Outside) — deep urban ruin, dense infected presence. High risk, high reward. Takes ~8 hours. Do not go alone.",
};

// ============================================================
//  PROMPT BUILDER
// ============================================================

export function buildPromptInjection(state: MessageStateType): string {
    const timeStr    = `Day ${state.day} | ${String(state.hour).padStart(2,"0")}:00`;
    const timeOfDay  = state.hour < 6 ? "night" : state.hour < 12 ? "morning" : state.hour < 18 ? "afternoon" : "evening";
    const present    = Object.values(state.characters).filter(c => c.present);
    const sh         = state.shelter;

    // Player location block
    const playerRoomDesc = ROOM_DESCRIPTIONS[state.playerRoom] ?? state.rooms[state.playerRoom]?.label ?? state.playerRoom;

    // Character blocks with emotional commentary
    const charLines = present.map(c => {
        const roomDesc = state.rooms[c.currentRoom]?.label ?? c.currentRoom;
        const hungerNote  = c.hunger  > 75 ? " [VERY HUNGRY]"  : c.hunger  > 50 ? " [hungry]"  : "";
        const staminaNote = c.stamina < 20 ? " [EXHAUSTED]"    : c.stamina < 40 ? " [tired]"   : "";
        const stressNote  = c.stress  > 75 ? " [HIGH STRESS]"  : c.stress  > 50 ? " [stressed]": "";
        const corruptNote = c.id === "elara" && c.corruption > 60 ? " [EMOTIONALLY DRIFTING]"
            : c.id === "elara" && c.corruption > 30 ? " [showing distance]" : "";
        return (
            `  ${c.name}: @${roomDesc} | ${c.currentAct}${hungerNote}${staminaNote}${stressNote}${corruptNote}` +
            ` | Hunger=${c.hunger} Stamina=${c.stamina} Stress=${c.stress}` +
            ` Loyalty=${c.loyalty} Affection=${c.affection}` +
            `${c.id === "elara" ? ` Corruption=${c.corruption}` : ""}` +
            `${c.injured ? " [INJURED]" : ""}`
        );
    }).join("\n");

    // Shelter resource warnings
    const warnings: string[] = [];
    if (sh.food    < 2)  warnings.push("FOOD CRITICAL");
    if (sh.water   < 2)  warnings.push("WATER CRITICAL");
    if (sh.power   < 20) warnings.push("POWER LOW");
    if (sh.medicine < 2) warnings.push("MEDICINE LOW");
    const warningLine = warnings.length > 0 ? `\nWARNINGS: ${warnings.join(" | ")}` : "";

    // Accessible rooms with descriptions
    const accessibleRooms = Object.values(state.rooms)
        .filter(r => ["accessible", "hallway"].includes(r.status) && !r.id.startsWith("w"))
        .map(r => r.id);

    const lockedRooms = Object.values(state.rooms)
        .filter(r => r.status === "locked")
        .map(r => r.label);

    const hiddenCount = Object.values(state.rooms)
        .filter(r => r.status === "hidden" && !r.id.startsWith("w")).length;

    return `
[BUNKER STATUS | ${timeStr} | ${timeOfDay}]
Player location: ${playerRoomDesc}

SURVIVORS:
${charLines}

SHELTER RESOURCES:
  Food=${sh.food.toFixed(1)} days | Water=${sh.water.toFixed(1)} days | Power=${sh.power}% | Medicine=${sh.medicine} units | Materials=${sh.materials} units${warningLine}

MAP STATE:
  Accessible rooms: ${accessibleRooms.join(", ")}
  Locked (can be unlocked through story): ${lockedRooms.join(", ") || "none"}
  Undiscovered rooms remaining: ${hiddenCount}
  Outside zones: zone_green (safe, ~3h), zone_yellow (moderate, ~5h), zone_red (dangerous, ~8h)

ROOM CONTEXT (current player location):
  ${playerRoomDesc}

EMBED THESE TAGS SILENTLY IN YOUR RESPONSE (no explanation, just weave them in):
  Time passing:       [TIME:+Nh]
  Stat change:        [STAT:name.stat+N] or [STAT:name.stat-N]  (names: elara, vera, rook | stats: hunger, stamina, stress, loyalty, affection, corruption)
  Shelter resource:   [STAT:shelter.food+N] [STAT:shelter.water+N] [STAT:shelter.medicine+N] [STAT:shelter.materials+N]
  Unlock/discover:    [UNLOCK:room_id]  (use twice to go hidden→locked→accessible)
  Rival arrives:      [ARRIVE:vera] or [ARRIVE:rook]
  Character moves:    [MOVE:name:room_id]
  Character activity: [ACT:name:activity description]
  Player moves:       [PLAYER:room_id]
  Injury:             [INJURY:name]
  Healed:             [HEAL:name]
  Room upgraded:      [UPGRADE:room_id:upgrade name]

Room IDs: bed_player bed_elara bed_vera bed_rook living kitchen medical generator storage botany gym zone_green zone_yellow zone_red
`.trim();
}

// ============================================================
//  DESIGN TOKENS
// ============================================================

const C = {
    bg:"#0c0e0d", panel:"#111412", panelAlt:"#151918",
    border:"#1e2820", borderLight:"#2a3828",
    accent:"#4d8560", accentDim:"#2a4d38", accentGlow:"#6aad80",
    text:"#c5d4bc", textDim:"#5e7060", textMuted:"#2e3c30",

    wall:"#090b0a",
    hidden:"#0f1210",
    locked:"#141c15",
    hallway:"#16201a",
    accessible:"#1c2a1e",
    scavengeGreen:"#112211", scavengeYellow:"#221a06", scavengeRed:"#220808",

    bWall:"#0d0f0d",
    bHallway:"#202820", bAccessible:"#2a4030", bLocked:"#1a2418",
    bSGreen:"#1a4020", bSYellow:"#403000", bSRed:"#401010",

    hunger:"#c0392b", stamina:"#4d8560", stress:"#d4a017",
    loyalty:"#5b8fa8", affection:"#a87dab", corruption:"#7b3fa0",
    dotElara:"#7ab0d4", dotVera:"#d47ab0", dotRook:"#d4a87a", dotPlayer:"#6aad80",
};

// ============================================================
//  COMPONENTS
// ============================================================

function Bar({ v, color }: { v: number; color: string }) {
    return (
        <div style={{ background:"#0a0e0a", borderRadius:2, height:3, width:"100%", overflow:"hidden" }}>
            <div style={{ width:`${Math.max(0,Math.min(100,v))}%`, height:"100%", background:color, transition:"width 0.4s" }} />
        </div>
    );
}

function CharCard({ char, rooms }: { char: CharacterStats; rooms: { [key: string]: Room } }) {
    const dot = char.id==="elara" ? C.dotElara : char.id==="vera" ? C.dotVera : C.dotRook;
    const stats = [
        {l:"HNG", v:char.hunger,    c:C.hunger},
        {l:"STA", v:char.stamina,   c:C.stamina},
        {l:"STR", v:char.stress,    c:C.stress},
        {l:"LOY", v:char.loyalty,   c:C.loyalty},
        {l:"AFF", v:char.affection, c:C.affection},
        ...(char.id==="elara" ? [{l:"COR", v:char.corruption, c:C.corruption}] : []),
    ];
    return (
        <div style={{
            background:C.panel, border:`1px solid ${C.border}`, borderLeft:`3px solid ${dot}`,
            borderRadius:4, padding:"7px 9px", marginBottom:5,
        }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ color:C.text, fontSize:11, fontWeight:"bold" }}>
          {char.name}{char.injured && <span style={{ color:C.hunger, marginLeft:5, fontSize:9 }}>⚕</span>}
        </span>
                <span style={{ color:C.textDim, fontSize:8 }}>{char.currentAct}</span>
            </div>
            <div style={{ color:C.textMuted, fontSize:8, marginBottom:5, fontStyle:"italic" }}>
                {rooms[char.currentRoom]?.label ?? char.currentRoom}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 8px" }}>
                {stats.map(({l,v,c}) => (
                    <div key={l}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:1 }}>
                            <span style={{ color:C.textDim, fontSize:8 }}>{l}</span>
                            <span style={{ color:C.textDim, fontSize:8 }}>{Math.round(v)}</span>
                        </div>
                        <Bar v={v} color={c} />
                    </div>
                ))}
            </div>
        </div>
    );
}

function RoomCell({
                      room, isPlayer, occupantIds, isSelected, onClick,
                  }: {
    room:Room; isPlayer:boolean; occupantIds:string[]; isSelected:boolean; onClick:()=>void;
}) {
    const s = room.status;
    const isHallway = s === "hallway";
    const isWall    = s === "wall";

    let bg = C.hidden, border = `1px solid #141814`, cursor = "default", labelColor = "transparent";

    if (isWall)            { bg = C.wall;        border = `1px solid ${C.bWall}`; }
    if (s==="hallway")     { bg = C.hallway;     border = `1px solid ${C.bHallway}`;    labelColor = C.textMuted; }
    if (s==="locked")      { bg = C.locked;      border = `1px solid ${C.bLocked}`;     labelColor = C.textDim;   cursor = "not-allowed"; }
    if (s==="accessible")  { bg = C.accessible;  border = `1px solid ${C.bAccessible}`; labelColor = C.text;      cursor = "pointer"; }
    if (s==="scavenge") {
        bg = room.zone==="green" ? C.scavengeGreen : room.zone==="yellow" ? C.scavengeYellow : C.scavengeRed;
        border = `1px solid ${room.zone==="green" ? C.bSGreen : room.zone==="yellow" ? C.bSYellow : C.bSRed}`;
        labelColor = C.text; cursor = "pointer";
    }
    if (isPlayer)   border = `2px solid ${C.accent}`;
    if (isSelected) border = `2px solid ${C.accentGlow}`;

    if (isWall) {
        return (
            <div style={{
                gridColumn:`${room.col} / span ${room.colSpan??1}`,
                gridRow:`${room.row} / span ${room.rowSpan??1}`,
                background:C.wall, border:`1px solid ${C.bWall}`,
                borderRadius:2,
            }} />
        );
    }

    return (
        <div
            onClick={(s==="accessible"||s==="scavenge") ? onClick : undefined}
            style={{
                gridColumn:`${room.col} / span ${room.colSpan??1}`,
                gridRow:`${room.row} / span ${room.rowSpan??1}`,
                background:bg, border, borderRadius: isHallway ? 2 : 4,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                cursor, position:"relative", padding: isHallway ? 1 : 4,
                overflow:"hidden", transition:"border-color 0.2s",
            }}
        >
            {s!=="hidden" && !isHallway && (
                <span style={{
                    color:labelColor, fontSize:7, fontFamily:"monospace",
                    textAlign:"center", lineHeight:1.3, textTransform:"uppercase",
                    letterSpacing:"0.04em", userSelect:"none", wordBreak:"break-word",
                }}>
          {s==="locked" ? "🔒 " : ""}{room.label}
                    {room.upgraded && <span style={{ color:C.stress, display:"block", fontSize:6 }}>★</span>}
        </span>
            )}
            {s==="scavenge" && (
                <span style={{
                    fontSize:6, marginTop:1, letterSpacing:"0.06em", textTransform:"uppercase",
                    color: room.zone==="green" ? "#3a8a3a" : room.zone==="yellow" ? "#8a7020" : "#8a2020",
                }}>
          {room.zone==="green" ? "safe" : room.zone==="yellow" ? "medium" : "danger"}
        </span>
            )}
            {isPlayer && (
                <div style={{
                    position:"absolute", top:3, right:3,
                    width:6, height:6, borderRadius:"50%",
                    background:C.dotPlayer, boxShadow:`0 0 6px ${C.dotPlayer}`,
                }} />
            )}
            {occupantIds.length > 0 && (
                <div style={{ position:"absolute", bottom:3, left:3, display:"flex", gap:2 }}>
                    {occupantIds.map(id => {
                        const dc = id==="elara" ? C.dotElara : id==="vera" ? C.dotVera : C.dotRook;
                        return <div key={id} style={{ width:5, height:5, borderRadius:"50%", background:dc, boxShadow:`0 0 4px ${dc}88` }} />;
                    })}
                </div>
            )}
        </div>
    );
}

// ============================================================
//  STAGE UI — standalone functional component
//  Exported so TestRunner can import and render it directly.
// ============================================================

export function StageUI({ state }: { state: MessageStateType }) {
    const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

    const presentChars = Object.values(state.characters).filter(c => c.present);
    const absentChars  = Object.values(state.characters).filter(c => !c.present);

    const occupantMap: { [id: string]: string[] } = {};
    presentChars.forEach(c => {
        if (!occupantMap[c.currentRoom]) occupantMap[c.currentRoom] = [];
        occupantMap[c.currentRoom].push(c.id);
    });

    const sh = state.shelter;

    return (
        <div style={{
            width:"100%", height:"100%", background:C.bg,
            display:"flex", flexDirection:"column",
            fontFamily:"'Courier New', Courier, monospace",
            color:C.text, overflow:"hidden",
        }}>

            {/* TOP BAR */}
            <div style={{
                background:C.panel, borderBottom:`1px solid ${C.border}`,
                padding:"5px 14px", display:"flex", alignItems:"center",
                justifyContent:"space-between", flexShrink:0,
            }}>
                <span style={{ color:C.accent, fontSize:10, letterSpacing:"0.18em", textTransform:"uppercase" }}>▣ BUNKER SIM</span>
                <span style={{ color:C.text, fontSize:11 }}>Day {state.day} · {String(state.hour).padStart(2,"0")}:00</span>
                <div style={{ display:"flex", gap:14 }}>
                    {[
                        {l:"FOOD",  v:`${sh.food.toFixed(1)}d`,  w:sh.food<2},
                        {l:"WATER", v:`${sh.water.toFixed(1)}d`, w:sh.water<2},
                        {l:"PWR",   v:`${sh.power}%`,            w:sh.power<20},
                        {l:"MEDS",  v:`${sh.medicine}u`,         w:sh.medicine<2},
                        {l:"MATS",  v:`${sh.materials}u`,        w:false},
                    ].map(({l,v,w}) => (
                        <span key={l} style={{ fontSize:9 }}>
              <span style={{ color:C.textDim }}>{l} </span>
              <span style={{ color:w ? C.hunger : C.text }}>{v}</span>
            </span>
                    ))}
                </div>
            </div>

            {/* MAIN */}
            <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

                {/* LEFT — survivors */}
                <div style={{
                    width:190, flexShrink:0,
                    borderRight:`1px solid ${C.border}`,
                    display:"flex", flexDirection:"column", overflow:"hidden",
                }}>
                    <div style={{ padding:"8px 10px 4px", color:C.textDim, fontSize:8, letterSpacing:"0.12em", textTransform:"uppercase" }}>
                        Survivors
                    </div>
                    <div style={{ flex:1, overflowY:"auto", padding:"0 8px 8px" }}>
                        {presentChars.map(c => <CharCard key={c.id} char={c} rooms={state.rooms} />)}
                        {absentChars.map(c => (
                            <div key={c.id} style={{
                                background:C.panel, border:`1px dashed ${C.border}`,
                                borderRadius:4, padding:"5px 9px", marginBottom:5, opacity:0.3,
                            }}>
                                <span style={{ fontSize:10, color:C.textDim }}>{c.name}</span>
                                <span style={{ fontSize:8, color:C.textMuted, display:"block" }}>not yet arrived</span>
                            </div>
                        ))}

                        {/* Log */}
                        <div style={{ marginTop:10, borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                            <div style={{ color:C.textDim, fontSize:8, marginBottom:5, letterSpacing:"0.12em", textTransform:"uppercase" }}>Log</div>
                            {state.log.slice(0,12).map((entry,i) => (
                                <div key={i} style={{
                                    color: i===0 ? C.textDim : C.textMuted,
                                    fontSize:8, marginBottom:3, lineHeight:1.5,
                                    borderLeft:`2px solid ${i===0 ? C.accentDim : C.border}`,
                                    paddingLeft:5,
                                }}>
                                    {entry}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT — map */}
                <div style={{
                    flex:1, display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center",
                    padding:16, overflow:"hidden",
                }}>
                    <div style={{ color:C.textDim, fontSize:8, marginBottom:8, letterSpacing:"0.15em", textTransform:"uppercase" }}>
                        Shelter Map
                    </div>

                    <div style={{
                        display:"grid",
                        gridTemplateColumns:"repeat(8, 1fr)",
                        gridTemplateRows:"repeat(9, 1fr)",
                        gap:3,
                        width:"100%", maxWidth:500,
                        maxHeight:"calc(100vh - 200px)",
                        aspectRatio:"8/9",
                    }}>
                        {Object.values(state.rooms).map(room => (
                            <RoomCell
                                key={room.id}
                                room={room}
                                isPlayer={state.playerRoom === room.id}
                                occupantIds={occupantMap[room.id] ?? []}
                                isSelected={selectedRoom === room.id}
                                onClick={() => setSelectedRoom(selectedRoom === room.id ? null : room.id)}
                            />
                        ))}
                    </div>

                    {/* Legend */}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"5px 12px", marginTop:8, justifyContent:"center" }}>
                        {[
                            {bg:C.wall,           b:C.bWall,       l:"Wall"},
                            {bg:C.hidden,         b:"#141814",     l:"Unknown"},
                            {bg:C.locked,         b:C.bLocked,     l:"Locked"},
                            {bg:C.hallway,        b:C.bHallway,    l:"Hallway"},
                            {bg:C.accessible,     b:C.bAccessible, l:"Room"},
                            {bg:C.scavengeGreen,  b:C.bSGreen,     l:"Safe Zone"},
                            {bg:C.scavengeYellow, b:C.bSYellow,    l:"Yellow Zone"},
                            {bg:C.scavengeRed,    b:C.bSRed,       l:"Red Zone"},
                        ].map(({bg,b,l}) => (
                            <div key={l} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                <div style={{ width:9, height:9, background:bg, border:`1px solid ${b}`, borderRadius:2 }} />
                                <span style={{ color:C.textDim, fontSize:8 }}>{l}</span>
                            </div>
                        ))}
                    </div>

                    <div style={{ display:"flex", gap:12, marginTop:5 }}>
                        {[
                            {c:C.dotPlayer, l:"You"},
                            {c:C.dotElara,  l:"Elara"},
                            {c:C.dotVera,   l:"Vera"},
                            {c:C.dotRook,   l:"Rook"},
                        ].map(({c,l}) => (
                            <div key={l} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                <div style={{ width:7, height:7, borderRadius:"50%", background:c, boxShadow:`0 0 4px ${c}` }} />
                                <span style={{ color:C.textDim, fontSize:8 }}>{l}</span>
                            </div>
                        ))}
                    </div>

                    {/* Selected room info */}
                    {selectedRoom && state.rooms[selectedRoom] && state.rooms[selectedRoom].status !== "wall" && (
                        <div style={{
                            marginTop:8, padding:"8px 12px",
                            background:C.panelAlt, border:`1px solid ${C.borderLight}`,
                            borderRadius:4, width:"100%", maxWidth:500,
                        }}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                                <span style={{ color:C.text, fontSize:11 }}>{state.rooms[selectedRoom].label}</span>
                                <span style={{ color:C.textDim, fontSize:9, textTransform:"uppercase" }}>{state.rooms[selectedRoom].status}</span>
                            </div>
                            {(occupantMap[selectedRoom]??[]).length > 0 && (
                                <div style={{ color:C.textDim, fontSize:9, marginBottom:2 }}>
                                    Present: {(occupantMap[selectedRoom]??[]).map(id=>state.characters[id]?.name).join(", ")}
                                </div>
                            )}
                            {state.rooms[selectedRoom].upgrades?.length && (
                                <div style={{ color:C.stress, fontSize:9 }}>★ {state.rooms[selectedRoom].upgrades!.join(" · ")}</div>
                            )}
                            {state.rooms[selectedRoom].status === "accessible" && (
                                <div style={{ color:C.accentGlow, fontSize:8, marginTop:3, fontStyle:"italic" }}>
                                    Describe what you want to do here in chat.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================
//  STAGE CLASS
// ============================================================

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    gameState: MessageStateType;

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        this.gameState = data.messageState != null
            ? data.messageState
            : JSON.parse(JSON.stringify(INITIAL_STATE));
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
        return { success:true, error:null, initState:null, chatState:null };
    }

    async setState(state: MessageStateType): Promise<void> {
        if (state != null) this.gameState = { ...this.gameState, ...state };
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        return {
            stageDirections: buildPromptInjection(this.gameState),
            messageState: this.gameState,
            modifiedMessage: null, systemMessage: null, error: null, chatState: null,
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const newState = parseTagsFromResponse(botMessage.content, this.gameState);
        this.gameState = newState;
        return {
            stageDirections: null, messageState: newState,
            modifiedMessage: null, error: null, systemMessage: null, chatState: null,
        };
    }

    render(): ReactElement {
        return <StageUI state={this.gameState} />;
    }
}
