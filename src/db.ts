import { openDB, DBSchema, IDBPDatabase } from 'idb';

export const NOTIFICATIONS_TABLE = "notifications";
// Define the shape of your database

export enum NotificationStatus {
    Unread = 0,
    Read = 1
}


export interface NotificationRecord {
    id: string;
    title: string;
    body: string;
    read: number; // 0 for unread, 1 for read
    timestamp: number;
};

interface MyDB extends DBSchema {
    notifications: {
        key: string;
        value: NotificationRecord,
        indexes: { 'by-read': 'read' };
    };
}

// Open the database
const dbPromise = openDB<MyDB>('born2win', 1, {
    upgrade(db) {
        const store = db.createObjectStore(NOTIFICATIONS_TABLE, { keyPath: 'id' });
        store.createIndex('by-read', 'read');
    },
});

export const getDB = (): Promise<IDBPDatabase<MyDB>> => {
    return dbPromise;
};