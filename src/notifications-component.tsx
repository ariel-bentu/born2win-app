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
import { getNiceDateTime, isNotEmpty, limitText } from './utils';
import { Divider } from 'primereact/divider';
import { AppServices, NotificationChannels, NotificationChannelsName } from './types';
import { ScrollPanel } from 'primereact/scrollpanel';

dayjs.extend(isToday);
dayjs.extend(isYesterday);


interface NotificationsComponentProps {
    updateUnreadCount: (count: number) => void;
    reload: number;
    topPosition: number;
    appServices: AppServices;
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
    name: string;
    notifications: NotificationRecord[];
}

const NotificationsComponent: React.FC<NotificationsComponentProps> = ({ updateUnreadCount, reload, topPosition, appServices }) => {
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
    const toast = useRef<Toast>(null);
    const [filter, setFilter] = useState(Filters.ALL);
    const menu = useRef<Menu>(null);
    const msgRef = useRef<ScrollPanel>(null);
    const [localReload, setLocalReload] = useState<number>(0);

    /*
    padding buttons = 16
    buttons unread/all = 40
    channel header = 50
    divider = 32
    spare 5
    */
    const channelsHeight = window.innerHeight - (143 + topPosition);
    useEffect(() => {
        readAllNotifications().then(allNotifications => {
            allNotifications.sort((n1, n2) => n2.timestamp - n1.timestamp);
            const unreadCount = allNotifications.reduce((count, notification) => notification.read === NotificationStatus.Unread ? count + 1 : count, 0);
            console.log("reload notifications from DB", allNotifications.length, "unread", unreadCount);

            updateUnreadCount(unreadCount);
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


            const newChannels = Object.keys(grouped).map(key => ({ name: key, notifications: grouped[key] }));

            newChannels.sort((a, b) => {
                const latestA = a.notifications[0]?.timestamp || 0;
                const latestB = a.notifications[0]?.timestamp || 0;
                return latestB - latestA;
            })

            setChannels(newChannels);

            setCurrentChannel(curr => {
                if (!curr) return null;
                return newChannels.find(ch => ch.name === curr.name) || null;
            })

        }).catch(err => console.error('Error fetching notifications:', err));
    }, [reload, localReload]);

    const markAsRead = async (id: string) => {
        await updateNotification(id, 1);
        setLocalReload(prev => prev + 1);
    }


    const deleteOne = async (id: string) => {
        await deleteNotification(id);
        setLocalReload(prev => prev + 1);
    };

    const deleteAll = (event: React.SyntheticEvent) => {
        confirmPopup({
            target: event.currentTarget as any,
            message: 'האם למחוק את כל ההודעות?',
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
                try {
                    await deleteAllNotifications();
                    setLocalReload(prev => prev + 1);
                } catch (error) {
                    console.error('Error deleting all notifications:', error);
                }
            }
        });
    };

    const markAllAsRead = async () => {
        const waitFor = notifications.map(n => updateNotification(n.id, 1));
        await Promise.all(waitFor);
        setLocalReload(prev => prev + 1);
    };

    const contextMenu = [
        { label: 'מחיקת כל ההודעות', icon: 'pi pi-fw pi-trash', command: (e) => deleteAll(e.originalEvent) },
        { label: 'סימון הכל כנקרא', icon: 'pi pi-fw pi-eye', command: markAllAsRead },
    ] as MenuItem[];

    const channelsToShow = channels.filter(ch => filter === Filters.ALL || ch.notifications.some(notif => notif.read == NotificationStatus.Unread));

    const channelNotifications = currentChannel?.notifications
        .filter(notif => filter === Filters.ALL || notif.read == Filters.UNREAD)
    return (
        <div style={{ overflowX: "hidden" }}>
            <Toast ref={toast} />
            <div className='flex flex-row relative justify-content-center align-items-center'>
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

            <div>
                {currentChannel === null ? (
                    // Channels view
                    channelsToShow.map((channel, i) => (
                        <ChannelComponent key={i} index={i} channel={channel}
                            onClick={() => {
                                setCurrentChannel(channel);
                                console.log("pushNavigationStep - channel", channel.name)
                                appServices.pushNavigationStep("channel", () => {
                                    setCurrentChannel(null);
                                })
                            }}
                        />
                    ))
                ) : (
                    // Full channel view
                    <div className='relative'>
                        <ChannelHeader name={currentChannel.name} onBack={() => {
                            setCurrentChannel(null);
                            console.log("popNavigationStep")
                            appServices.popNavigationStep();
                        }
                        } />
                        <Divider />
                        <ScrollPanel style={{ width: '100%', height: channelsHeight }} ref={msgRef}>
                            {channelNotifications && channelNotifications.length > 0 ?

                                channelNotifications?.map(notification => {
                                    // <OneNotification
                                    const buttonStr = notification.data?.buttons;
                                    let buttons;
                                    if (buttonStr && buttonStr.length) {
                                        try {
                                            buttons = JSON.parse(buttonStr);
                                        } catch (err) {
                                            // console.log("Button failed parse", buttonStr)
                                        }
                                    }
                                    return <OneLine
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
                                        buttons={buttons}
                                        onLineButtonPressed={NotificationActionHandler}
                                        onRead={() => markAsRead(notification.id)}
                                    />
                                }) :
                                <div className='no-messages'>{getNoNotificationMessage(filter)}</div>
                            }
                        </ScrollPanel>
                    </div>
                )}
                {!channelsToShow?.length && <div className='no-messages'>{getNoNotificationMessage(filter)}</div>}

            </div>
        </div>
    );
};

function getNoNotificationMessage(filter: number): string {
    return "אין הודעות" + (filter === Filters.UNREAD ? " שלא נקראו" : "");
}

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
    return <div className="w-12 flex flex-col align-items-center">
        {onBack ? <div className="back-btn" onClick={onBack}>
            <span className="pi pi-angle-right text-4xl" ></span>
        </div> : <div style={{ width: 5 }} />}
        <div className='channel-icon'>
            <span className={"pi text-4xl " + iconName}></span>
        </div>
        <div className='text-2xl mr-2'>{niceName}</div>
    </div>
}

export default NotificationsComponent;