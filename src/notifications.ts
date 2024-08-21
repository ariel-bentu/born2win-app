import { getDB } from './db'; // Adjust the import path to your actual db file

export const readAllNotifications = async () => {
    const db = await getDB();
    return db.getAll('notifications');
};

export const countUnreadNotifications = async () => {
    try {
        const db = await getDB();
        const tx = db.transaction('notifications', 'readonly');
        const store = tx.objectStore('notifications');
        const index = store.index('by-read');

        //console.log('Counting unread notifications...');
        const unreadCount = await index.count(IDBKeyRange.only(0)); // Use 0 for unread
        //console.log('Unread count:', unreadCount);

        return unreadCount;
    } catch (error) {
        console.error('Error counting unread notifications:', error);
        throw error;
    }
};

export const updateNotification = async (id: string, read: number) => { // Use number for read
    try {
        const db = await getDB();
        const tx = db.transaction('notifications', 'readwrite');
        const store = tx.objectStore('notifications');
        const notification = await store.get(id);

        if (notification) {
            notification.read = read;
            await store.put(notification);
        }

        await tx.done;
    } catch (error) {
        console.error('Error updating notification:', error);
    }
};

export const deleteAllNotifications = async () => {
    try {
        const db = await getDB();
        await db.clear('notifications');
    } catch (error) {
        console.error('Error deleting all notifications:', error);
    }
};

export const deleteNotification = async (id: string) => {
    try {
        const db = await getDB();
        await db.delete('notifications', id);
    } catch (error) {
        console.error('Error deleting notification:', error);
    }
};