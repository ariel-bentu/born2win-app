import React from 'react';
import { Button } from 'primereact/button';
import { ConfirmPopup, confirmPopup } from 'primereact/confirmpopup';

interface OneNotificationProps {
    title: string;
    body: string;
    unread: boolean;
    footer?: string;
    onDelete?: () => void;
    onRead: () => void;
}

const OneNotification: React.FC<OneNotificationProps> = ({ title, body, unread, footer, onDelete, onRead }) => {

    const handleCopyLink = (link: string) => {
        navigator.clipboard.writeText(link);
    };

    const renderMessagePart = (part: string, index: number) => {
        const colonIndex = part.indexOf(':');
    
        if (colonIndex !== -1) {
            const value = part.slice(colonIndex + 1).trim();
            const isLink = value.startsWith('http://') || value.startsWith('https://');
            const label = part.slice(0, colonIndex + (isLink?0:1));
            return (
                <p className="flex align-items-center" key={index}>
                    {isLink ?  <>
                            <a href={value} target="_blank" rel="noopener noreferrer" className='ml-2'>
                                {label}
                            </a>
                            <Button icon="pi pi-copy" label="העתק" className="p-button-text p-button-rounded" onClick={() => handleCopyLink(value)} style={{ marginLeft: '0.5rem' }} />
                        </>:
                    <>
                    <strong className="pl-1">{label}</strong> <div>{value}</div>
                    </>}
                </p>
            );
        }
    
        return <p key={index}>{part}</p>;
    };

    return (
        <div className="col-12">
            <div className="surface-card shadow-2 p-3 border-round" onClick={onRead}>
                <div className="flex justify-content-between mb-3">
                    <div className="flex flex-column align-right">
                        <div className={`text-right  text-xl font-xlarge mb-3 ${unread ? 'font-bold' : ''}`}>{title}</div>
                        <div className="text-900 font-medium text-700">
                            {body.split('\n').map(renderMessagePart)}
                        </div>
                    </div>
                    <div className="flex relative align-items-center justify-content-center bg-purple-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                        <i className="pi pi-comment text-purple-500 text-xl"></i>
                        {unread && <div className='red-dot' />}
                    </div>
                </div>
                <div className="flex flex-row align-items-end justify-content-between">
                    {footer && <span className="text-500">{footer}</span>}
                    {onDelete && <div className="flex justify-content-end mt-3">
                        <Button unstyled icon="pi pi-trash" className='icon-btn' onClick={(event) => {
                            confirmPopup({
                                target: event.currentTarget,
                                message: 'Are you sure you want to delete this notification?',
                                icon: 'pi pi-exclamation-triangle',
                                accept: onDelete,
                            });
                        }} />
                    </div>}
                </div>
            </div>
        </div>
    );
};

export default OneNotification;