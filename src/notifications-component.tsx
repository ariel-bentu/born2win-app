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
import { NotificationActionHandler } from './notification-actions';
import "./notifications.css"
import { limitText } from './utils';
import { Divider } from 'primereact/divider';
import { NotificationChannels, NotificationChannelsName } from './types';
import { ScrollPanel } from 'primereact/scrollpanel';

dayjs.extend(isToday);
dayjs.extend(isYesterday);

function getNiceDateTime(d: number) {
    const theDate = dayjs(d);
    if (theDate.isToday()) {
        return theDate.format("HH:mm");
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

interface Channel {
    name:string;
    notifications: NotificationRecord[];
}

const NotificationsComponent: React.FC<NotificationsComponentProps> = ({ updateUnreadCount, reload }) => {
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
    const toast = useRef<Toast>(null);
    const [filter, setFilter] = useState(Filters.ALL);
    const menu = useRef<Menu>(null);
    const divRef = useRef<HTMLDivElement>(null);
    const msgRef = useRef<ScrollPanel>(null);

    const fetchNotifications = async () => {
        try {
            const allNotifications = await readAllNotifications();
            allNotifications.sort((n1, n2) => n2.timestamp - n1.timestamp);
            setNotifications(allNotifications);

            // Group notifications by channel
            const grouped = allNotifications.reduce((acc: any, notification: NotificationRecord) => {
                const channel = notification.data?.channel || NotificationChannels.General;
                if (!acc[channel]) {
                    acc[channel] = [];
                }
                acc[channel].push(notification);
                return acc;
            }, {});

            
            const channels = Object.keys(grouped).map(key=>({name:key, notifications: grouped[key]}));
                
            channels.sort((a, b) => {
                const latestA = a.notifications[0]?.timestamp || 0;
                const latestB = a.notifications[0]?.timestamp || 0;
                return latestB - latestA;
            })

            setChannels(channels);
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
    };

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

    const channelsToShow =  channels.filter(ch => filter === Filters.ALL || ch.notifications.some(notif=>notif.read == NotificationStatus.Unread));
    const scrollAreaHeight = currentChannel && divRef.current ?
        window.innerHeight - divRef.current.getBoundingClientRect().top - 50 : 400

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
                <div>
                    {currentChannel === null ? (
                        // Channels view
                        channelsToShow.map((channel, i) => (
                            <ChannelComponent key={i} index={i} channel={channel} 
                                onClick={() => {
                                    setCurrentChannel(channel);
                                    if (msgRef.current) {
                                        const scrollableElement = msgRef.current.getContent();
                                        scrollableElement.scrollTop = 100;
                                    }
                                    msgRef.current?.getElement().scrollTo(0, 50);//scrollPanelRef.current.content.scrollHeight;
                                }}
                            />
                        ))
                    ) : (
                        // Full channel view
                        <div className='h-full relative'>
                            <ChannelHeader name={currentChannel.name} onBack={() => setCurrentChannel(null)} />
                            <div className="flex-grow" ref={divRef}>
                                <ScrollPanel style={{ width: '100%', height: scrollAreaHeight }} ref={msgRef}>
                                    {currentChannel.notifications.map(notification => (
                                        // <OneNotification
                                        <OneLine
                                            hideIcon={true}
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
                                            onLineButtonPressed={NotificationActionHandler}
                                            onRead={() => markAsRead(notification.id)}
                                        />
                                    ))}
                                </ScrollPanel>
                            </div>
                        </div>
                    )}
                    {!channelsToShow?.length && <div className='no-messages'>אין הודעות</div>}
                </div>
            </div>
        </div>
    );
};


interface ChannelProps {
    channel: Channel;
    onClick: () => void;
    index: number;
}

function ChannelComponent({ channel, onClick, index }: ChannelProps) {
    const unreadCount = channel.notifications.reduce((count, notification) => notification.read === NotificationStatus.Unread ? count + 1 : count, 0);

    return <div className="w-12 flex flex-column relative" onClick={onClick}>
        {/* BADGE */}
        {unreadCount > 0 && <div className='channel-badge'>{unreadCount}</div>}
        {index == 0 && <Divider />}
        {/* HEADER */}


        <ChannelHeader name={channel.name} />
        {/* First message */}
        <div className="w-12 flex flex-column align-items-start">

            <div className='text-3 mr-2'>{channel.notifications[0].title}</div>
            <div className='text-2 mr-2'>{limitText(channel.notifications[0].body, 60)}</div>
            <div className='text-1 mr-2'>{getNiceDateTime(channel.notifications[0].timestamp)}</div>
        </div>
        <Divider />
    </div>
}

interface ChannelHeaderProps {
    name: string;
    onBack?: () => void;
}
function ChannelHeader({ name, onBack }: ChannelHeaderProps) {
    const niceName = NotificationChannelsName[name]?.name || "כל השאר";
    const iconName = NotificationChannelsName[name]?.icon || "pi-clipboard";
    console.log("ch", name, niceName)
    return <div className="w-12 flex flex-col align-items-center">
        {<div className="back-btn" onClick={onBack}>
            {onBack && <span className="pi pi-angle-right text-4xl" ></span>}
        </div>}
        <div className='channel-icon'>
            <span className={"pi text-4xl " + iconName}></span>
        </div>
        <div className='text-2xl mr-2'>{niceName}</div>
    </div>
}

export default NotificationsComponent;