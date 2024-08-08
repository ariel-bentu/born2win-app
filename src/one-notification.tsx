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
    return (
        <div className="col-12">
            <div className="surface-card shadow-2 p-3 border-round" onClick={onRead}>
                <div className="flex justify-content-between mb-3">
                    <div>
                        <span className={`block text-xl font-xlarge mb-3 ${unread ? 'font-bold' : ''}`}>{title}</span>
                        <div className="text-900 font-medium text-700">{body}</div>
                    </div>
                    <div className="flex align-items-center justify-content-center bg-purple-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                        <i className="pi pi-comment text-purple-500 text-xl"></i>
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