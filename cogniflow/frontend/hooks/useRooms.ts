import { useState, useEffect } from 'react';

export interface Room {
    code: string;
    title: string;
    concept: string;
    questionCount: number;
    timePerQuestion: number; // seconds
    createdBy: string; // teacher email
    createdAt: string;
    status: 'waiting' | 'active' | 'ended';
    participants: { email: string; name: string; joinedAt: string }[];
}

const ROOMS_KEY = 'cogniflow_rooms';

function getRooms(): Record<string, Room> {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(ROOMS_KEY) || '{}'); } catch { return {}; }
}

function saveRooms(rooms: Record<string, Room>) {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
}

function generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

export function useRooms() {
    const [rooms, setRooms] = useState<Record<string, Room>>({});

    useEffect(() => {
        setRooms(getRooms());
        // Poll for room updates every 2 seconds (simulates real-time)
        const interval = setInterval(() => setRooms(getRooms()), 2000);
        return () => clearInterval(interval);
    }, []);

    const createRoom = (
        title: string,
        concept: string,
        questionCount: number,
        timePerQuestion: number,
        creatorEmail: string
    ): string => {
        let code = generateCode();
        const allRooms = getRooms();
        while (allRooms[code]) code = generateCode(); // ensure unique
        const room: Room = {
            code, title, concept, questionCount, timePerQuestion,
            createdBy: creatorEmail,
            createdAt: new Date().toISOString(),
            status: 'waiting',
            participants: [],
        };
        allRooms[code] = room;
        saveRooms(allRooms);
        setRooms({ ...allRooms });
        return code;
    };

    const joinRoom = (code: string, email: string, name: string): string | null => {
        const allRooms = getRooms();
        const room = allRooms[code.toUpperCase()];
        if (!room) return 'Room not found. Check your code and try again.';
        if (room.status === 'ended') return 'This exam has already ended.';
        if (room.participants.find(p => p.email === email)) return null; // already joined
        room.participants.push({ email, name, joinedAt: new Date().toISOString() });
        allRooms[code.toUpperCase()] = room;
        saveRooms(allRooms);
        setRooms({ ...allRooms });
        return null;
    };

    const startRoom = (code: string): boolean => {
        const allRooms = getRooms();
        if (!allRooms[code]) return false;
        allRooms[code].status = 'active';
        saveRooms(allRooms);
        setRooms({ ...allRooms });
        return true;
    };

    const endRoom = (code: string) => {
        const allRooms = getRooms();
        if (!allRooms[code]) return;
        allRooms[code].status = 'ended';
        saveRooms(allRooms);
        setRooms({ ...allRooms });
    };

    const getRoom = (code: string): Room | null => {
        return getRooms()[code.toUpperCase()] || null;
    };

    return { rooms, createRoom, joinRoom, startRoom, endRoom, getRoom };
}
