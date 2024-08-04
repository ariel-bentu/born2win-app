import React, { useEffect, useState, useRef } from 'react';
import {
    readAllNotifications,
    countUnreadNotifications,
    updateNotification,
    deleteNotification,
    deleteAllNotifications
} from './notifications'; // Adjust the import path to your actual notifications file
import { Button } from 'primereact/button';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { NotificationRecord } from './db';

interface NotificationsComponentProps {
    updateUnreadCount: (count: number) => void;
}

const NotificationsComponent: React.FC<NotificationsComponentProps> = ({ updateUnreadCount }) => {
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const toast = useRef<Toast>(null);

    const fetchNotifications = async () => {
        try {
            const allNotifications = await readAllNotifications();
            setNotifications(allNotifications);

            const unread = await countUnreadNotifications();
            updateUnreadCount(unread);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const markAsRead = async (id: string) => {
        try {
            await updateNotification(id, 1); // Use 1 for read
            await fetchNotifications();
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const deleteOne = async (id: string) => {
        try {
            await deleteNotification(id);
            await fetchNotifications();
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    };

    const deleteAll = async () => {
        try {
            await deleteAllNotifications();
            await fetchNotifications();
        } catch (error) {
            console.error('Error deleting all notifications:', error);
        }
    };

    return (
        <div>
            <Toast ref={toast} />
            <Button onClick={deleteAll}>Delete All</Button>
            <DataTable value={notifications}>
                <Column field="title" header="Title" />
                <Column field="body" header="Body" />
                <Column field="read" header="Read" body={(data) => data.read === 1 ? 'Yes' : 'No'} />
                <Column header="Actions" body={(data) => (
                    <>
                        <Button onClick={() => markAsRead(data.id)}>Mark as Read</Button>
                        <Button onClick={() => deleteOne(data.id)}>Delete</Button>
                    </>
                )} />
            </DataTable>
        </div>
    );
};

export default NotificationsComponent;