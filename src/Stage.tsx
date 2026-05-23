import { ReactElement, useState } from "react";
import { StageBase, StageResponse, InitialData, Message } from "@chub-ai/stages-ts";
import { LoadResponse } from "@chub-ai/stages-ts/dist/types/load";

// ============================================================
//  TYPES
// ============================================================

type RoomStatus = "wall" | "hidden" | "locked" | "accessible" | "hallway" | "outside";

interface Connection {
    direction: string;   // "north" | "south" | "east" | "west" | "up" | "down"
    targetId: string;    // room id
}

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
    // adjacency — which rooms can be reached from here and in what direction
    connections: Connection[];
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
    present: boolean;
    injured: boolean;
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
//
//  8 cols × 9 rows. Each non-wall room defines its connections
//  explicitly — this is what the LLM gets injected with so it
//  knows exactly what exits are available and can never narrate
//  walking through a wall.
//
//  Connections are BIDIRECTIONAL — defined on both sides.
//
//  Layout (col, row):
//
//  Row 1:  [wall] [Vera's Room: 2-3] [wall] [Rook's Room: 5-6] [wall][wall]
//  Row 2:  [Your Room:1] [Hallway:2-4] [Elara's Room:5-6] [wall][wall]
//  Row 3:  [Hallway:1] [Living Room:2-3] [Hallway:4] [Botany:5-6] [wall][wall]
//  Row 4:  [Hallway:1] [Living Room:2-3] [Hallway:4] [Botany:5-6] [wall][wall]
//  Row 5:  [Medical:1-2] [Hallway:3] [Kitchen:4-5] [Gym:6-7]
//  Row 6:  [Hallway:1-2] [Hallway:3] [Hallway:4-5] [Gym:6-7]
//  Row 7:  [Generator:1-2] [Hallway:3-4] [Storage:5-6] [wall][wall]
//  Row 8:  [wall x8] — thick bunker wall separating inside/outside
//  Row 9:  [Green Zone:1-2] [Yellow Zone:3-4] [Red Zone:5-6] [wall][wall]
// ============================================================

const INITIAL_ROOMS: { [key: string]: Room } = {

    // ── ROW 1 ────────────────────────────────────────────────
    w1_1:       { id:"w1_1",      label:"",             status:"wall",      col:1, row:1, connections:[] },
    bed_vera:   { id:"bed_vera",  label:"Vera's Room",  status:"hidden",    col:2, row:1, colSpan:2, connections:[
            { direction:"south", targetId:"hall_top" },
        ]},
    w1_4:       { id:"w1_4",      label:"",             status:"wall",      col:4, row:1, connections:[] },
    bed_rook:   { id:"bed_rook",  label:"Rook's Room",  status:"hidden",    col:5, row:1, colSpan:2, connections:[
            { direction:"south", targetId:"bed_elara" },
        ]},
    w1_7:       { id:"w1_7",      label:"",             status:"wall",      col:7, row:1, connections:[] },
    w1_8:       { id:"w1_8",      label:"",             status:"wall",      col:8, row:1, connections:[] },

    // ── ROW 2 ────────────────────────────────────────────────
    bed_player: { id:"bed_player", label:"Your Room",   status:"accessible", col:1, row:2, connections:[
            { direction:"east",  targetId:"hall_top" },
            { direction:"south", targetId:"hall_left" },
        ]},
    hall_top:   { id:"hall_top",  label:"Hallway",      status:"hallway",   col:2, row:2, colSpan:3, connections:[
            { direction:"west",  targetId:"bed_player" },
            { direction:"east",  targetId:"bed_elara" },
            { direction:"north", targetId:"bed_vera" },
            { direction:"south", targetId:"living" },
        ]},
    bed_elara:  { id:"bed_elara", label:"Elara's Room", status:"accessible", col:5, row:2, colSpan:2, connections:[
            { direction:"west",  targetId:"hall_top" },
            { direction:"north", targetId:"bed_rook" },
            { direction:"south", targetId:"botany" },
        ]},
    w2_7:       { id:"w2_7",      label:"",             status:"wall",      col:7, row:2, connections:[] },
    w2_8:       { id:"w2_8",      label:"",             status:"wall",      col:8, row:2, connections:[] },

    // ── ROWS 3-4 ─────────────────────────────────────────────
    hall_left:  { id:"hall_left", label:"Hallway",      status:"hallway",   col:1, row:3, rowSpan:2, connections:[
            { direction:"north", targetId:"bed_player" },
            { direction:"east",  targetId:"living" },
            { direction:"south", targetId:"medical" },
        ]},
    living:     { id:"living",    label:"Living Room",  status:"accessible", col:2, row:3, colSpan:2, rowSpan:2, connections:[
            { direction:"north", targetId:"hall_top" },
            { direction:"west",  targetId:"hall_left" },
            { direction:"east",  targetId:"hall_right" },
            { direction:"south", targetId:"hall_mid" },
        ]},
    hall_right: { id:"hall_right",label:"Hallway",      status:"hallway",   col:4, row:3, rowSpan:2, connections:[
            { direction:"west",  targetId:"living" },
            { direction:"east",  targetId:"botany" },
            { direction:"south", targetId:"kitchen" },
        ]},
    botany:     { id:"botany",    label:"Botany Lab",   status:"hidden",    col:5, row:3, colSpan:2, rowSpan:2, connections:[
            { direction:"north", targetId:"bed_elara" },
            { direction:"west",  targetId:"hall_right" },
            { direction:"south", targetId:"gym" },
        ]},
    w3_7:       { id:"w3_7",      label:"",             status:"wall",      col:7, row:3, connections:[] },
    w3_8:       { id:"w3_8",      label:"",             status:"wall",      col:8, row:3, connections:[] },
    w4_7:       { id:"w4_7",      label:"",             status:"wall",      col:7, row:4, connections:[] },
    w4_8:       { id:"w4_8",      label:"",             status:"wall",      col:8, row:4, connections:[] },

    // ── ROW 5 ────────────────────────────────────────────────
    medical:    { id:"medical",   label:"Medical Bay",  status:"locked",    col:1, row:5, colSpan:2, connections:[
            { direction:"north", targetId:"hall_left" },
            { direction:"east",  targetId:"hall_mid" },
            { direction:"south", targetId:"hall_down" },
        ]},
    hall_mid:   { id:"hall_mid",  label:"Hallway",      status:"hallway",   col:3, row:5, rowSpan:2, connections:[
            { direction:"north", targetId:"living" },
            { direction:"west",  targetId:"medical" },
            { direction:"east",  targetId:"kitchen" },
            { direction:"south", targetId:"hall_bot" },
        ]},
    kitchen:    { id:"kitchen",   label:"Kitchen",      status:"locked",    col:4, row:5, colSpan:2, connections:[
            { direction:"north", targetId:"hall_right" },
            { direction:"west",  targetId:"hall_mid" },
            { direction:"east",  targetId:"gym" },
            { direction:"south", targetId:"hall_kitch" },
        ]},
    gym:        { id:"gym",       label:"Gym",          status:"hidden",    col:6, row:5, colSpan:2, rowSpan:2, connections:[
            { direction:"north", targetId:"botany" },
            { direction:"west",  targetId:"kitchen" },
        ]},

    // ── ROW 6 ────────────────────────────────────────────────
    hall_down:  { id:"hall_down", label:"Hallway",      status:"hallway",   col:1, row:6, colSpan:2, connections:[
            { direction:"north", targetId:"medical" },
            { direction:"east",  targetId:"hall_mid" },
            { direction:"south", targetId:"generator" },
        ]},
    // hall_mid spans rows 5-6 col 3
    hall_kitch: { id:"hall_kitch",label:"Hallway",      status:"hallway",   col:4, row:6, colSpan:2, connections:[
            { direction:"north", targetId:"kitchen" },
            { direction:"west",  targetId:"hall_mid" },
            { direction:"south", targetId:"storage" },
        ]},
    // gym spans rows 5-6 cols 6-7

    // ── ROW 7 ────────────────────────────────────────────────
    generator:  { id:"generator", label:"Generator",   status:"accessible", col:1, row:7, colSpan:2, connections:[
            { direction:"north", targetId:"hall_down" },
            { direction:"east",  targetId:"hall_bot" },
        ]},
    hall_bot:   { id:"hall_bot",  label:"Hallway",      status:"hallway",   col:3, row:7, colSpan:2, connections:[
            { direction:"north", targetId:"hall_mid" },
            { direction:"west",  targetId:"generator" },
            { direction:"east",  targetId:"storage" },
        ]},
    storage:    { id:"storage",   label:"Storage",     status:"accessible", col:5, row:7, colSpan:2, connections:[
            { direction:"north", targetId:"hall_kitch" },
            { direction:"west",  targetId:"hall_bot" },
        ]},
    w7_7:       { id:"w7_7",      label:"",             status:"wall",      col:7, row:7, connections:[] },
    w7_8:       { id:"w7_8",      label:"",             status:"wall",      col:8, row:7, connections:[] },

    // ── ROW 8 — thick bunker wall ─────────────────────────────
    w8_1:       { id:"w8_1",      label:"",             status:"wall",      col:1, row:8, connections:[] },
    w8_2:       { id:"w8_2",      label:"",             status:"wall",      col:2, row:8, connections:[] },
    w8_3:       { id:"w8_3",      label:"",             status:"wall",      col:3, row:8, connections:[] },
    w8_4:       { id:"w8_4",      label:"",             status:"wall",      col:4, row:8, connections:[] },
    w8_5:       { id:"w8_5",      label:"",             status:"wall",      col:5, row:8, connections:[] },
    w8_6:       { id:"w8_6",      label:"",             status:"wall",      col:6, row:8, connections:[] },
    w8_7:       { id:"w8_7",      label:"",             status:"wall",      col:7, row:8, connections:[] },
    w8_8:       { id:"w8_8",      label:"",             status:"wall",      col:8, row:8, connections:[] },

    // ── ROW 9 — outside scavenge zones ───────────────────────
    // These are accessible only via the blast door (generator room)
    // The LLM handles scavenge as an expedition, not step-by-step nav
    zone_green:  { id:"zone_green",  label:"Green Zone",  status:"outside", zone:"green",  col:1, row:9, colSpan:2, connections:[
            { direction:"return", targetId:"generator" },
        ]},
    zone_yellow: { id:"zone_yellow", label:"Yellow Zone", status:"outside", zone:"yellow", col:3, row:9, colSpan:2, connections:[
            { direction:"return", targetId:"generator" },
        ]},
    zone_red:    { id:"zone_red",    label:"Red Zone",    status:"outside", zone:"red",    col:5, row:9, colSpan:2, connections:[
            { direction:"return", targetId:"generator" },
        ]},
    w9_7:        { id:"w9_7",        label:"",            status:"wall",     col:7, row:9, connections:[] },
    w9_8:        { id:"w9_8",        label:"",            status:"wall",     col:8, row:9, connections:[] },
};

const INITIAL_CHARACTERS: { [key: string]: CharacterStats } = {
    elara: {
        id:"elara", name:"Elara", present:true,
        hunger:20, stamina:80, stress:30,
        loyalty:85, affection:60, corruption:0,
        currentRoom:"living", currentAct:"reading",
        injured:false,
    },
    vera: {
        id:"vera", name:"Vera", present:false,
        hunger:0, stamina:100, stress:0,
        loyalty:50, affection:40, corruption:0,
        currentRoom:"bed_vera", currentAct:"resting",
        injured:false,
    },
    rook: {
        id:"rook", name:"Rook", present:false,
        hunger:0, stamina:100, stress:0,
        loyalty:50, affection:30, corruption:0,
        currentRoom:"gym", currentAct:"training",
        injured:false,
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
//  ADJACENCY HELPERS
// ============================================================

/** Returns the available exits from a room, filtered to only
 *  rooms that are accessible (not hidden, not wall, not locked). */
export function getAvailableExits(roomId: string, rooms: { [key: string]: Room }): Connection[] {
    const room = rooms[roomId];
    if (!room) return [];
    return room.connections.filter(conn => {
        const target = rooms[conn.targetId];
        if (!target) return false;
        // hallways and accessible rooms are passable; locked/hidden/wall are not
        return ["accessible", "hallway", "outside"].includes(target.status);
    });
}

/** Returns a human-readable exits string like the maze's
 *  "Available Directions: [ north → Living Room, east → Hallway ]" */
export function buildExitsLine(roomId: string, rooms: { [key: string]: Room }): string {
    const exits = getAvailableExits(roomId, rooms);
    if (exits.length === 0) return "No exits available.";
    return "[ " + exits.map(e => `${e.direction} → ${rooms[e.targetId]?.label || e.targetId}`).join(", ") + " ]";
}

/** Move the player in a direction. Returns new room id if valid, current if blocked. */
export function movePlayer(
    currentRoomId: string,
    direction: string,
    rooms: { [key: string]: Room }
): { newRoomId: string; blocked: boolean; reason?: string } {
    const room = rooms[currentRoomId];
    if (!room) return { newRoomId: currentRoomId, blocked: true, reason: "current room not found" };

    const conn = room.connections.find(c => c.direction.toLowerCase() === direction.toLowerCase());
    if (!conn) return { newRoomId: currentRoomId, blocked: true, reason: `no passage to the ${direction}` };

    const target = rooms[conn.targetId];
    if (!target) return { newRoomId: currentRoomId, blocked: true, reason: "target room not found" };

    if (target.status === "wall")   return { newRoomId: currentRoomId, blocked: true, reason: "solid wall" };
    if (target.status === "hidden") return { newRoomId: currentRoomId, blocked: true, reason: "no visible passage" };
    if (target.status === "locked") return { newRoomId: currentRoomId, blocked: true, reason: `${target.label} is locked` };

    return { newRoomId: conn.targetId, blocked: false };
}

// ============================================================
//  TAG PARSER
// ============================================================

export function parseTagsFromResponse(
    response: string,
    state: MessageStateType
): MessageStateType {
    let s: MessageStateType = JSON.parse(JSON.stringify(state));

    // TIME
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

    // UNLOCK
    [...response.matchAll(/\[UNLOCK:(\w+)\]/gi)].forEach(m => {
        const r = s.rooms[m[1]];
        if (!r) return;
        if (r.status === "hidden")      { r.status = "locked";     s.log.unshift(`Discovered: ${r.label}`); }
        else if (r.status === "locked") { r.status = "accessible"; s.log.unshift(`Unlocked: ${r.label}`); }
    });

    // ARRIVE
    [...response.matchAll(/\[ARRIVE:(\w+)\]/gi)].forEach(m => {
        const c = s.characters[m[1]];
        if (!c) return;
        c.present = true;
        s.log.unshift(`${c.name} has arrived at the shelter.`);
        const rm = s.rooms[`bed_${m[1]}`];
        if (rm) rm.status = "accessible";
    });

    // STAT
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

    // MOVE (character)
    [...response.matchAll(/\[MOVE:(\w+):(\w+)\]/gi)].forEach(m => {
        if (s.characters[m[1]] && s.rooms[m[2]]) s.characters[m[1]].currentRoom = m[2];
    });

    // ACT
    [...response.matchAll(/\[ACT:(\w+):([^\]]+)\]/gi)].forEach(m => {
        if (s.characters[m[1]]) s.characters[m[1]].currentAct = m[2];
    });

    // PLAYER — move player explicitly by room id
    const pm = response.match(/\[PLAYER:(\w+)\]/i);
    if (pm && s.rooms[pm[1]]) s.playerRoom = pm[1];

    // GO — move player by direction (enforces wall collision)
    const gm = response.match(/\[GO:(\w+)\]/i);
    if (gm) {
        const result = movePlayer(s.playerRoom, gm[1], s.rooms);
        if (!result.blocked) {
            s.playerRoom = result.newRoomId;
            s.log.unshift(`Moved ${gm[1]} → ${s.rooms[result.newRoomId]?.label}`);
        } else {
            s.log.unshift(`Blocked: ${result.reason}`);
        }
    }

    // INJURY / HEAL
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

    // UPGRADE
    [...response.matchAll(/\[UPGRADE:(\w+):([^\]]+)\]/gi)].forEach(m => {
        const r = s.rooms[m[1]];
        if (r) {
            r.upgraded = true;
            if (!r.upgrades) r.upgrades = [];
            r.upgrades.push(m[2]);
            s.log.unshift(`${r.label} upgraded: ${m[2]}`);
        }
    });

    return s;
}

// ============================================================
//  ROOM DESCRIPTIONS
// ============================================================

const ROOM_DESCRIPTIONS: { [key: string]: string } = {
    bed_player:  "Your Room — a sparse bunk, footlocker, small lamp. Private and quiet.",
    bed_elara:   "Elara's Room — neatly kept, hand-drawn sketches pinned to the wall, dog-eared books by the bed.",
    bed_vera:    "Vera's Room — claimed quickly after she arrived. Smells faintly floral. Warm and personal.",
    bed_rook:    "Rook's Room — spartan. A cot, a weapons rack, a water-stained map pinned above the desk.",
    living:      "Living Room — the heart of the bunker. Worn sofa, salvaged TV, mismatched mugs on the coffee table.",
    kitchen:     "Kitchen — two-burner camp stove, canned goods on wire shelves, a hand-pump water filter.",
    medical:     "Medical Bay — former storage converted to a clinic. Cots, supply cabinet, antiseptic smell.",
    generator:   "Generator Room — loud, warm, smells of diesel. Gauges track fuel and output. The blast door is here.",
    storage:     "Storage Room — floor-to-ceiling shelving. Crates, tarps, tools, spare parts.",
    botany:      "Botany Lab — UV grow lights, hydroponic trays. Vegetables still growing from before the collapse.",
    gym:         "Gym — rubber mats, free weights, pull-up bar. Rook spends most of his time here.",
    zone_green:  "Green Zone — nearby streets, mostly clear. Low risk, modest rewards. ~3 hours out.",
    zone_yellow: "Yellow Zone — further out, signs of recent infected. Moderate risk, better loot. ~5 hours.",
    zone_red:    "Red Zone — deep urban ruin, dense infected. High risk, high reward. ~8 hours. Do not go alone.",
};

// ============================================================
//  PROMPT BUILDER
// ============================================================

export function buildPromptInjection(state: MessageStateType): string {
    const timeStr   = `Day ${state.day} | ${String(state.hour).padStart(2,"0")}:00`;
    const timeOfDay = state.hour < 6 ? "night" : state.hour < 12 ? "morning" : state.hour < 18 ? "afternoon" : "evening";
    const present   = Object.values(state.characters).filter(c => c.present);
    const sh        = state.shelter;

    const playerRoom    = state.rooms[state.playerRoom];
    const playerRoomDesc = ROOM_DESCRIPTIONS[state.playerRoom] ?? playerRoom?.label ?? state.playerRoom;

    // ── Available exits from player's current position ──────
    // This is the key injection — same idea as the maze's "Available Directions"
    const exits = getAvailableExits(state.playerRoom, state.rooms);
    const exitsLine = buildExitsLine(state.playerRoom, state.rooms);

    // Also list what's BLOCKED (locked/hidden) so narrator can reference them
    const blockedExits = (playerRoom?.connections ?? []).filter(conn => {
        const t = state.rooms[conn.targetId];
        return t && (t.status === "locked" || t.status === "hidden");
    });
    const blockedLine = blockedExits.length > 0
        ? blockedExits.map(e => {
            const t = state.rooms[e.targetId];
            return `${e.direction} → ${t.status === "locked" ? `🔒 ${t.label}` : "unknown passage"}`;
        }).join(", ")
        : "none";

    // ── Character blocks ─────────────────────────────────────
    const charLines = present.map(c => {
        const roomLabel = state.rooms[c.currentRoom]?.label ?? c.currentRoom;
        const notes = [
            c.hunger  > 75 ? "[VERY HUNGRY]"  : c.hunger  > 50 ? "[hungry]"  : "",
            c.stamina < 20 ? "[EXHAUSTED]"     : c.stamina < 40 ? "[tired]"   : "",
            c.stress  > 75 ? "[HIGH STRESS]"   : c.stress  > 50 ? "[stressed]": "",
            c.id === "elara" && c.corruption > 60 ? "[EMOTIONALLY DRIFTING]"
                : c.id === "elara" && c.corruption > 30 ? "[showing distance]" : "",
            c.injured ? "[INJURED]" : "",
        ].filter(Boolean).join(" ");
        return (
            `  ${c.name}: @${roomLabel} | ${c.currentAct} ${notes}\n` +
            `    Hunger=${c.hunger} Stamina=${c.stamina} Stress=${c.stress} ` +
            `Loyalty=${c.loyalty} Affection=${c.affection}` +
            `${c.id==="elara" ? ` Corruption=${c.corruption}` : ""}`
        );
    }).join("\n");

    // ── Shelter warnings ─────────────────────────────────────
    const warnings: string[] = [];
    if (sh.food    < 2)  warnings.push("⚠ FOOD CRITICAL");
    if (sh.water   < 2)  warnings.push("⚠ WATER CRITICAL");
    if (sh.power   < 20) warnings.push("⚠ POWER LOW");
    if (sh.medicine < 2) warnings.push("⚠ MEDICINE LOW");

    // ── Room state summary ───────────────────────────────────
    const accessibleRooms = Object.values(state.rooms)
        .filter(r => r.status === "accessible" && !r.id.startsWith("w"))
        .map(r => r.label);
    const lockedRooms = Object.values(state.rooms)
        .filter(r => r.status === "locked")
        .map(r => r.label);
    const hiddenCount = Object.values(state.rooms)
        .filter(r => r.status === "hidden" && !r.id.startsWith("w")).length;

    return `
[BUNKER | ${timeStr} | ${timeOfDay}]
${warnings.length > 0 ? warnings.join(" | ") + "\n" : ""}
PLAYER:
  Location: ${playerRoomDesc}
  Available exits: ${exitsLine}
  Blocked passages nearby: ${blockedLine}

SURVIVORS:
${charLines || "  (none present)"}

SHELTER:
  Food=${sh.food.toFixed(1)}d  Water=${sh.water.toFixed(1)}d  Power=${sh.power}%  Medicine=${sh.medicine}u  Materials=${sh.materials}u

MAP STATE:
  Accessible rooms: ${accessibleRooms.join(", ") || "none"}
  Locked rooms: ${lockedRooms.join(", ") || "none"}
  Undiscovered rooms: ${hiddenCount}

MOVEMENT & TAG RULES:
  - The player is in: ${playerRoom?.label ?? state.playerRoom}
  - Valid exits from here: ${exitsLine}
  - If the player tries to move in a direction NOT listed above, there is a wall or locked door. Describe the obstacle; do NOT use [GO:] or [PLAYER:] for that direction.
  - To move the player: [GO:direction]  (e.g. [GO:north]) — stage enforces walls automatically.
  - Alternatively place by room id: [PLAYER:room_id]
  - Characters move: [MOVE:name:room_id]
  - Characters can only move to accessible/hallway rooms.

AVAILABLE TAGS (embed silently — never explain tags to the player):
  [TIME:+Nh]                       — advance time N hours
  [STAT:name.stat+N/-N]            — change stat (names: elara vera rook | stats: hunger stamina stress loyalty affection corruption)
  [STAT:shelter.resource+N/-N]     — change shelter resource (food water power medicine materials)
  [GO:direction]                   — move player by direction (enforces walls)
  [PLAYER:room_id]                 — teleport player (use for scene jumps only)
  [MOVE:name:room_id]              — move a character
  [ACT:name:description]           — set character activity
  [UNLOCK:room_id]                 — discover (hidden→locked) or open (locked→accessible) a room
  [ARRIVE:vera] / [ARRIVE:rook]    — survivor arrives at the shelter
  [INJURY:name] / [HEAL:name]      — injure or heal a character
  [UPGRADE:room_id:upgrade name]   — upgrade a room

ROOM IDs: bed_player bed_elara bed_vera bed_rook living kitchen medical generator storage botany gym hall_top hall_left hall_right hall_mid hall_down hall_kitch hall_bot zone_green zone_yellow zone_red
`.trim();
}

// ============================================================
//  DESIGN TOKENS
// ============================================================

const C = {
    bg:"#0c0e0d",       panel:"#111412",      panelAlt:"#151918",
    border:"#1e2820",   borderLight:"#2a3828",
    accent:"#4d8560",   accentDim:"#2a4d38",  accentGlow:"#6aad80",
    text:"#c5d4bc",     textDim:"#5e7060",    textMuted:"#2e3c30",

    wall:"#090b0a",     hidden:"#0f1210",     locked:"#141c15",
    hallway:"#161e17",  accessible:"#1c2a1e", outside:"#0e1a0e",
    outsideYellow:"#1a1600", outsideRed:"#1a0a0a",

    bWall:"#0d0f0d",    bHallway:"#202820",   bAccessible:"#2a4030",
    bLocked:"#1a2418",  bOutside:"#1a4020",   bOutsideY:"#403000", bOutsideR:"#401010",

    hunger:"#c0392b",   stamina:"#4d8560",    stress:"#d4a017",
    loyalty:"#5b8fa8",  affection:"#a87dab",  corruption:"#7b3fa0",
    dotElara:"#7ab0d4", dotVera:"#d47ab0",    dotRook:"#d4a87a",   dotPlayer:"#6aad80",
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
                      availableFromPlayer,
                  }: {
    room: Room;
    isPlayer: boolean;
    occupantIds: string[];
    isSelected: boolean;
    onClick: () => void;
    availableFromPlayer: boolean;
}) {
    const s = room.status;
    if (s === "wall") {
        return (
            <div style={{
                gridColumn:`${room.col} / span ${room.colSpan??1}`,
                gridRow:`${room.row} / span ${room.rowSpan??1}`,
                background:C.wall, border:`1px solid ${C.bWall}`, borderRadius:2,
            }} />
        );
    }

    let bg     = C.hidden;
    let border = `1px solid #141814`;
    let cursor = "default";
    let labelColor = "transparent";

    if (s === "hallway")    { bg = C.hallway;       border = `1px solid ${C.bHallway}`;    labelColor = C.textMuted; }
    if (s === "locked")     { bg = C.locked;        border = `1px solid ${C.bLocked}`;     labelColor = C.textDim;   cursor = "not-allowed"; }
    if (s === "accessible") { bg = C.accessible;    border = `1px solid ${C.bAccessible}`; labelColor = C.text;      cursor = "pointer"; }
    if (s === "outside") {
        bg = room.zone==="green" ? C.outside : room.zone==="yellow" ? C.outsideYellow : C.outsideRed;
        border = `1px solid ${room.zone==="green" ? C.bOutside : room.zone==="yellow" ? C.bOutsideY : C.bOutsideR}`;
        labelColor = C.text; cursor = "pointer";
    }

    // Highlight rooms reachable from player's current position
    if (availableFromPlayer && !isPlayer) {
        border = `1px dashed ${C.accentDim}`;
    }
    if (isPlayer)   border = `2px solid ${C.accent}`;
    if (isSelected) border = `2px solid ${C.accentGlow}`;

    return (
        <div
            onClick={(s==="accessible"||s==="outside") ? onClick : undefined}
            style={{
                gridColumn:`${room.col} / span ${room.colSpan??1}`,
                gridRow:`${room.row} / span ${room.rowSpan??1}`,
                background:bg, border, borderRadius: s==="hallway" ? 2 : 4,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                cursor, position:"relative", padding: s==="hallway" ? 1 : 4,
                overflow:"hidden", transition:"border-color 0.2s",
            }}
        >
            {s !== "hidden" && s !== "hallway" && (
                <span style={{
                    color:labelColor, fontSize:7, fontFamily:"monospace",
                    textAlign:"center", lineHeight:1.3, textTransform:"uppercase",
                    letterSpacing:"0.04em", userSelect:"none", wordBreak:"break-word",
                }}>
                    {s==="locked" ? "🔒 " : ""}{room.label}
                    {room.upgraded && <span style={{ color:C.stress, display:"block", fontSize:6 }}>★</span>}
                </span>
            )}
            {s === "outside" && (
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
//  STAGE UI
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

    // Rooms reachable from player's current position (for map highlight)
    const availableExits = getAvailableExits(state.playerRoom, state.rooms);
    const reachableIds = new Set(availableExits.map(e => e.targetId));

    const selectedRoomData = selectedRoom ? state.rooms[selectedRoom] : null;

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
                <span style={{ color:C.accent, fontSize:10, letterSpacing:"0.18em", textTransform:"uppercase" }}>▣ BUNKER</span>
                <span style={{ color:C.text, fontSize:11 }}>Day {state.day} · {String(state.hour).padStart(2,"0")}:00</span>
                <div style={{ display:"flex", gap:12 }}>
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

                {/* LEFT — survivors + log */}
                <div style={{
                    width:185, flexShrink:0,
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
                    padding:"12px 16px", overflow:"hidden",
                }}>

                    {/* Current location + exits — the key "maze-style" info line */}
                    <div style={{
                        width:"100%", maxWidth:500,
                        background:C.panelAlt, border:`1px solid ${C.borderLight}`,
                        borderRadius:4, padding:"6px 10px", marginBottom:8,
                        display:"flex", flexDirection:"column", gap:3,
                    }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                            <span style={{ color:C.accent, fontSize:9, textTransform:"uppercase", letterSpacing:"0.12em" }}>
                                📍 {state.rooms[state.playerRoom]?.label ?? state.playerRoom}
                            </span>
                            <span style={{ color:C.textMuted, fontSize:8 }}>your position</span>
                        </div>
                        <div style={{ color:C.textDim, fontSize:8 }}>
                            <span style={{ color:C.textMuted }}>Exits: </span>
                            {availableExits.length === 0
                                ? <span style={{ color:C.hunger }}>none</span>
                                : availableExits.map((e, i) => (
                                    <span key={e.targetId}>
                                        {i > 0 && <span style={{ color:C.textMuted }}>, </span>}
                                        <span style={{ color:C.accentGlow }}>{e.direction}</span>
                                        <span style={{ color:C.textMuted }}> → </span>
                                        <span style={{ color:C.text }}>{state.rooms[e.targetId]?.label}</span>
                                    </span>
                                ))
                            }
                        </div>
                    </div>

                    <div style={{ color:C.textDim, fontSize:8, marginBottom:6, letterSpacing:"0.15em", textTransform:"uppercase" }}>
                        Shelter Map
                    </div>

                    <div style={{
                        display:"grid",
                        gridTemplateColumns:"repeat(8, 1fr)",
                        gridTemplateRows:"repeat(9, 1fr)",
                        gap:3,
                        width:"100%", maxWidth:500,
                        maxHeight:"calc(100vh - 280px)",
                        aspectRatio:"8/9",
                    }}>
                        {Object.values(state.rooms).map(room => (
                            <RoomCell
                                key={room.id}
                                room={room}
                                isPlayer={state.playerRoom === room.id}
                                occupantIds={occupantMap[room.id] ?? []}
                                isSelected={selectedRoom === room.id}
                                availableFromPlayer={reachableIds.has(room.id)}
                                onClick={() => setSelectedRoom(selectedRoom === room.id ? null : room.id)}
                            />
                        ))}
                    </div>

                    {/* Legend */}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 10px", marginTop:6, justifyContent:"center" }}>
                        {[
                            {bg:C.wall,         b:C.bWall,      l:"Wall"},
                            {bg:C.hidden,        b:"#141814",    l:"Unknown"},
                            {bg:C.locked,        b:C.bLocked,    l:"Locked"},
                            {bg:C.hallway,       b:C.bHallway,   l:"Hallway"},
                            {bg:C.accessible,    b:C.bAccessible,l:"Room"},
                            {bg:C.outside,       b:C.bOutside,   l:"Safe Zone"},
                            {bg:C.outsideYellow, b:C.bOutsideY,  l:"Med Zone"},
                            {bg:C.outsideRed,    b:C.bOutsideR,  l:"Red Zone"},
                        ].map(({bg,b,l}) => (
                            <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
                                <div style={{ width:8, height:8, background:bg, border:`1px solid ${b}`, borderRadius:2 }} />
                                <span style={{ color:C.textDim, fontSize:7 }}>{l}</span>
                            </div>
                        ))}
                        <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                            <div style={{ width:8, height:8, border:`1px dashed ${C.accentDim}`, borderRadius:2 }} />
                            <span style={{ color:C.textDim, fontSize:7 }}>Reachable</span>
                        </div>
                    </div>

                    {/* Character dot legend */}
                    <div style={{ display:"flex", gap:10, marginTop:4 }}>
                        {[
                            {c:C.dotPlayer, l:"You"},
                            {c:C.dotElara,  l:"Elara"},
                            {c:C.dotVera,   l:"Vera"},
                            {c:C.dotRook,   l:"Rook"},
                        ].map(({c,l}) => (
                            <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
                                <div style={{ width:6, height:6, borderRadius:"50%", background:c, boxShadow:`0 0 4px ${c}` }} />
                                <span style={{ color:C.textDim, fontSize:7 }}>{l}</span>
                            </div>
                        ))}
                    </div>

                    {/* Selected room popover */}
                    {selectedRoomData && selectedRoomData.status !== "wall" && selectedRoomData.status !== "hidden" && (
                        <div style={{
                            marginTop:7, padding:"7px 11px",
                            background:C.panelAlt, border:`1px solid ${C.borderLight}`,
                            borderRadius:4, width:"100%", maxWidth:500,
                        }}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                                <span style={{ color:C.text, fontSize:11 }}>{selectedRoomData.label}</span>
                                <span style={{ color:C.textDim, fontSize:9, textTransform:"uppercase" }}>{selectedRoomData.status}</span>
                            </div>
                            {ROOM_DESCRIPTIONS[selectedRoomData.id] && (
                                <div style={{ color:C.textDim, fontSize:8, marginBottom:3, lineHeight:1.5, fontStyle:"italic" }}>
                                    {ROOM_DESCRIPTIONS[selectedRoomData.id]}
                                </div>
                            )}
                            {(occupantMap[selectedRoomData.id]??[]).length > 0 && (
                                <div style={{ color:C.textDim, fontSize:9, marginBottom:2 }}>
                                    Present: {(occupantMap[selectedRoomData.id]??[]).map(id=>state.characters[id]?.name).join(", ")}
                                </div>
                            )}
                            {selectedRoomData.upgrades?.length && (
                                <div style={{ color:C.stress, fontSize:9 }}>★ {selectedRoomData.upgrades.join(" · ")}</div>
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