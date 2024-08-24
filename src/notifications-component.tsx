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
import { NotificationRecord, NotificationStatus } from './db';
import { confirmPopup } from 'primereact/confirmpopup';
import { SelectButton } from 'primereact/selectbutton';
import "./notifications-component.css";
import { Menu } from 'primereact/menu';
import { MenuItem } from 'primereact/menuitem';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';
import OneLine from './one-line';

dayjs.extend(isToday);
dayjs.extend(isYesterday);


function getNiceDateTime(d: number) {
    const theDate = dayjs(d);
    if (theDate.isToday()) {
        return "היום ב " + theDate.format("HH:mm");
    } else if (theDate.isYesterday()) {
        return "אתמול ב " + theDate.format("HH:mm");
    }
    return theDate.format("[יום ]dddd, D [ב]MMMM HH:mm");
}

interface NotificationsComponentProps {
    updateUnreadCount: (count: number) => void;
    reload: number;
}
const Filters = {
    ALL: 1,
    UNREAD: 2,
    array: [
        { name: 'הכל', value: 1 },
        { name: 'לא נקראו', value: 2 },
    ]
}


const NotificationsComponent: React.FC<NotificationsComponentProps> = ({ updateUnreadCount, reload }) => {
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const toast = useRef<Toast>(null);
    const [filter, setFilter] = useState(Filters.ALL);

    const menu = useRef<Menu>(null);


    const fetchNotifications = async () => {
        try {
            const allNotifications = await readAllNotifications();
            allNotifications.sort((n1, n2) => n2.timestamp - n1.timestamp);
            setNotifications(allNotifications);


        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [reload]);

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

    const deleteAll = (event: React.SyntheticEvent) => {
        confirmPopup({
            target: event.currentTarget as any,
            message: 'האם למחוק את כל ההודעות?',
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
                try {
                    await deleteAllNotifications();
                    fetchNotifications();
                    countUnreadNotifications().then(updateUnreadCount);
                } catch (error) {
                    console.error('Error deleting all notifications:', error);
                }
            }
        });
    }

    const markAllAsRead = () => {
        try {
            const waitFor = notifications.map(n => updateNotification(n.id, 1));
            Promise.all(waitFor).then(() => {
                updateUnreadCount(0);
                fetchNotifications();
            });
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const contextMenu = [
        { label: 'מחיקת כל ההודעות', icon: 'pi pi-fw pi-trash', command: (e) => deleteAll(e.originalEvent) },
        { label: 'סימון הכל כנקרא', icon: 'pi pi-fw pi-eye', command: markAllAsRead },
    ] as MenuItem[];

    const notificationToShow = notifications?.filter(n => filter === Filters.ALL || n.read == NotificationStatus.Unread);

    return (
        <div>
            <Toast ref={toast} />
            <div className='flex flex-row relative'>
                <SelectButton
                    pt={{ root: { className: "select-button-container" } }}
                    unstyled
                    value={filter} onChange={(e) => setFilter(e.value)} optionLabel="name" options={Filters.array}
                    itemTemplate={(option) => (
                        <div className={`select-button-item ${filter === option.value ? 'p-highlight' : ''}`}>
                            {option.name}
                        </div>
                    )}
                />
                <Menu model={contextMenu} popup ref={menu} />
                <Button unstyled icon="pi pi-ellipsis-v" className="three-dot-menu" onClick={(event) => menu.current?.toggle(event)} />
            </div>

            <div className="surface-ground px-4 py-5 md:px-6 lg:px-8">
                <div className="grid">
                    {notificationToShow?.length ?
                        notificationToShow.map(notification => {
                            (notification as any)?.data && console.log(JSON.parse((notification as any)?.data?.buttons))
                            return <OneLine
                                key={notification.id}
                                title={notification.title}
                                body={notification.body}
                                footer={getNiceDateTime(notification.timestamp)}
                                unread={notification.read == NotificationStatus.Unread}
                                onDelete={(event) => {
                                    confirmPopup({
                                        target: event.currentTarget,
                                        message: "האם למחוק הודעה זו?",
                                        icon: 'pi pi-exclamation-triangle',
                                        accept: () => deleteOne(notification.id),
                                    });
                                }}
                                deleteLabel="מחק"
                                buttons={notification.data?.buttons && JSON.parse(notification.data?.buttons)}
                                onRead={() => markAsRead(notification.id)}
                            />
                        }) :
                    <div className='no-messages'>אין הודעות</div>
                    }

                </div>
            </div>
        </div>
    );
};

export default NotificationsComponent;