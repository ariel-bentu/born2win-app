import React, { useEffect, useState, useRef } from 'react';
import {
    readAllNotifications,
    countUnreadNotifications,
    updateNotification,
    deleteNotification,
    deleteAllNotifications
} from './notifications'; // Adjust the import path to your actual notifications file
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { NotificationRecord } from './db';
import OneNotification from './one-notification';
import { confirmPopup, ConfirmPopup } from 'primereact/confirmpopup';

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
            fetchNotifications();
            countUnreadNotifications().then(updateUnreadCount);
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const deleteOne = async (id: string) => {
        try {
            await deleteNotification(id);
            fetchNotifications();
            countUnreadNotifications().then(updateUnreadCount);
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    };

    const deleteAll = async () => {
        try {
            await deleteAllNotifications();
            fetchNotifications();
            countUnreadNotifications().then(updateUnreadCount);
        } catch (error) {
            console.error('Error deleting all notifications:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const waitFor = notifications.map(n=>updateNotification(n.id, 1));
            Promise.all(waitFor).then(()=>{
                updateUnreadCount(0);
                fetchNotifications();
            });
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    return (
        <div>
            <Toast ref={toast} />
            <ConfirmPopup />
            <Button onClick={(event) => {
                        confirmPopup({
                            target: event.currentTarget,
                            message: 'Are you sure you want to delete all notifications?',
                            icon: 'pi pi-exclamation-triangle',
                            accept: deleteAll,
                        });                        
                    }}>Delete All</Button>
            <Button onClick={markAllAsRead}>Mark All as Read</Button>


            <div className="surface-ground px-4 py-5 md:px-6 lg:px-8">
                <div className="grid">
                    {notifications?.map(notification => (
                        <OneNotification
                            key={notification.id}
                            title={notification.title}
                            body={notification.body}
                            unread={notification.read == 0}
                            onDelete={() => deleteOne(notification.id)}
                            onRead={()=>markAsRead(notification.id)}
                        />
                    ))}

                </div>
            </div>
        </div>
    );
};

export default NotificationsComponent;